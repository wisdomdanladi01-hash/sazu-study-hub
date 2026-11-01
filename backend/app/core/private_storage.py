from pathlib import Path
from uuid import uuid4

from app.core.config import settings

_RESOURCE_FILE_TYPES = {
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

_FILE_SIGNATURES = {
    "application/pdf": b"%PDF-",
    "image/jpeg": b"\xff\xd8\xff",
    "image/png": b"\x89PNG\r\n\x1a\n",
    "image/webp": b"RIFF",
}


def private_storage_root() -> Path:
    from app.core.storage import LocalPrivateStorageProvider

    return LocalPrivateStorageProvider()._root()


def store_verification_document(content: bytes, content_type: str | None) -> tuple[str, str]:
    if not content or len(content) > settings.verification_document_max_bytes:
        raise ValueError("The document is empty or exceeds the configured size limit.")
    if content_type not in _FILE_SIGNATURES:
        raise ValueError("Only PDF, JPEG, and PNG documents are accepted.")
    if not content.startswith(_FILE_SIGNATURES[content_type]):
        raise ValueError("The document content does not match its declared file type.")

    storage_key = f"verification/{uuid4().hex}.private"
    path = (private_storage_root() / storage_key).resolve()
    if not path.is_relative_to(private_storage_root()):
        raise ValueError("Invalid private storage key.")
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("xb") as document_file:
        document_file.write(content)
    return storage_key, content_type


def store_resource_file(
    content: bytes, original_filename: str, content_type: str | None
) -> tuple[str, str, str]:
    from app.core.storage import get_storage_provider

    provider = get_storage_provider()
    obj = provider.store_file(content, original_filename, content_type, subfolder="resources")
    return obj.storage_key, obj.content_type, obj.original_filename


def resolve_private_storage_key(storage_key: str) -> Path:
    root = private_storage_root()
    path = (root / storage_key).resolve()
    if not path.is_relative_to(root):
        raise ValueError("Invalid private storage key.")
    return path


def delete_private_storage_key(storage_key: str) -> None:
    from app.core.storage import get_storage_provider

    provider = get_storage_provider()
    provider.delete_file(storage_key)
