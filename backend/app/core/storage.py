from __future__ import annotations

import hashlib
import io
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO
from uuid import uuid4

import urllib.request
import urllib.error
import json

from app.core.config import settings

_RESOURCE_FILE_TYPES: dict[str, tuple[str, bytes | None]] = {
    "application/pdf": (".pdf", b"%PDF-"),
    "image/jpeg": (".jpg", b"\xff\xd8\xff"),
    "image/png": (".png", b"\x89PNG\r\n\x1a\n"),
    "image/webp": (".webp", b"RIFF"),
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": (
        ".docx",
        b"PK\x03\x04",
    ),
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": (
        ".pptx",
        b"PK\x03\x04",
    ),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": (
        ".xlsx",
        b"PK\x03\x04",
    ),
    "text/plain": (".txt", None),
}


@dataclass(frozen=True)
class StoredObject:
    storage_key: str
    original_filename: str
    content_type: str
    size_bytes: int
    storage_provider: str
    sha256: str
    url: str | None = None


def validate_file_content(
    content: bytes, original_filename: str, content_type: str | None, max_bytes: int
) -> tuple[str, str]:
    """Validate filename, MIME type, size, and magic bytes."""
    filename = Path(original_filename.replace("\\", "/")).name
    if not filename or len(filename) > 255:
        raise ValueError("A valid filename of at most 255 characters is required.")
    if not content:
        raise ValueError("The uploaded file is empty.")
    if len(content) > max_bytes:
        raise ValueError(f"The file size exceeds the configured limit of {max_bytes} bytes.")

    file_info = _RESOURCE_FILE_TYPES.get(content_type or "")
    if file_info is None:
        raise ValueError(
            "Only PDF, JPEG, PNG, WebP, DOCX, PPTX, XLSX, and plain-text files are accepted."
        )

    extension, signature = file_info
    ext = Path(filename).suffix.lower()
    if ext != extension and not (extension == ".jpg" and ext in {".jpg", ".jpeg"}):
        raise ValueError("The filename extension does not match the declared file type.")

    if signature is not None:
        if not content.startswith(signature):
            raise ValueError("The resource content does not match its declared file type.")
        if content_type == "image/webp" and len(content) >= 12:
            if content[8:12] != b"WEBP":
                raise ValueError("Invalid WebP image structure.")

    if content_type == "text/plain":
        try:
            content.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise ValueError("Plain-text resources must be UTF-8 encoded.") from exc

    return filename, content_type or ""


class StorageProvider(ABC):
    @property
    @abstractmethod
    def provider_name(self) -> str:
        ...

    @abstractmethod
    def store_file(
        self,
        content: bytes,
        original_filename: str,
        content_type: str | None,
        *,
        subfolder: str = "resources",
        max_bytes: int | None = None,
    ) -> StoredObject:
        ...

    @abstractmethod
    def read_file(self, storage_key: str) -> tuple[BinaryIO, int]:
        ...

    @abstractmethod
    def resolve_local_path(self, storage_key: str) -> Path | None:
        ...

    @abstractmethod
    def delete_file(self, storage_key: str) -> None:
        ...


class LocalPrivateStorageProvider(StorageProvider):
    @property
    def provider_name(self) -> str:
        return "local_private"

    def _root(self) -> Path:
        root = Path(settings.private_storage_dir).resolve()
        root.mkdir(parents=True, exist_ok=True)
        return root

    def store_file(
        self,
        content: bytes,
        original_filename: str,
        content_type: str | None,
        *,
        subfolder: str = "resources",
        max_bytes: int | None = None,
    ) -> StoredObject:
        limit = max_bytes or settings.resource_max_bytes
        filename, mime = validate_file_content(content, original_filename, content_type, limit)

        storage_key = f"{subfolder}/{uuid4().hex}.private"
        root = self._root()
        path = (root / storage_key).resolve()
        if not path.is_relative_to(root):
            raise ValueError("Invalid storage path traversal.")

        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("xb") as f:
            f.write(content)

        checksum = hashlib.sha256(content).hexdigest()
        return StoredObject(
            storage_key=storage_key,
            original_filename=filename,
            content_type=mime,
            size_bytes=len(content),
            storage_provider=self.provider_name,
            sha256=checksum,
            url=None,
        )

    def resolve_local_path(self, storage_key: str) -> Path:
        root = self._root()
        path = (root / storage_key).resolve()
        if not path.is_relative_to(root) or not path.is_file():
            raise FileNotFoundError(f"Storage object '{storage_key}' not found.")
        return path

    def read_file(self, storage_key: str) -> tuple[BinaryIO, int]:
        path = self.resolve_local_path(storage_key)
        size = path.stat().st_size
        return path.open("rb"), size

    def delete_file(self, storage_key: str) -> None:
        try:
            path = self.resolve_local_path(storage_key)
            path.unlink(missing_ok=True)
        except (FileNotFoundError, ValueError):
            pass


class VercelBlobStorageProvider(StorageProvider):
    def __init__(self, token: str):
        self._token = token

    @property
    def provider_name(self) -> str:
        return "vercel_blob"

    def store_file(
        self,
        content: bytes,
        original_filename: str,
        content_type: str | None,
        *,
        subfolder: str = "resources",
        max_bytes: int | None = None,
    ) -> StoredObject:
        limit = max_bytes or settings.resource_max_bytes
        filename, mime = validate_file_content(content, original_filename, content_type, limit)

        key = f"{subfolder}/{uuid4().hex}/{filename}"
        url = f"https://blob.vercel-storage.com/{key}"
        req = urllib.request.Request(
            url,
            data=content,
            headers={
                "Authorization": f"Bearer {self._token}",
                "x-api-version": "7",
                "x-content-type": mime,
                "x-add-random-suffix": "false",
            },
            method="PUT",
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                blob_url = data.get("url")
                storage_key = key
        except Exception as exc:
            # Fall back to storing locally if remote Vercel Blob network fails
            fallback = LocalPrivateStorageProvider()
            obj = fallback.store_file(
                content, original_filename, content_type, subfolder=subfolder, max_bytes=max_bytes
            )
            return obj

        checksum = hashlib.sha256(content).hexdigest()
        return StoredObject(
            storage_key=storage_key,
            original_filename=filename,
            content_type=mime,
            size_bytes=len(content),
            storage_provider=self.provider_name,
            sha256=checksum,
            url=blob_url,
        )

    def resolve_local_path(self, storage_key: str) -> Path | None:
        # Vercel Blob has no local path unless cached
        return None

    def read_file(self, storage_key: str) -> tuple[BinaryIO, int]:
        url = f"https://blob.vercel-storage.com/{storage_key}"
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {self._token}"})
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                content = resp.read()
                return io.BytesIO(content), len(content)
        except Exception as exc:
            # Check local private fallback
            fallback = LocalPrivateStorageProvider()
            return fallback.read_file(storage_key)

    def delete_file(self, storage_key: str) -> None:
        url = "https://blob.vercel-storage.com/delete"
        payload = json.dumps({"urls": [f"https://blob.vercel-storage.com/{storage_key}"]}).encode(
            "utf-8"
        )
        req = urllib.request.Request(
            url,
            data=payload,
            headers={
                "Authorization": f"Bearer {self._token}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=15):
                pass
        except Exception:
            pass


def get_storage_provider(preferred: str | None = None) -> StorageProvider:
    choice = preferred or settings.storage_provider.lower()
    token = settings.blob_read_write_token
    if (choice in {"vercel_blob", "auto"}) and token:
        return VercelBlobStorageProvider(token)
    return LocalPrivateStorageProvider()

