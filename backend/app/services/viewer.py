from __future__ import annotations

import hashlib
import io
import threading
import xml.etree.ElementTree as ET
import zipfile
from collections import OrderedDict
from dataclasses import dataclass

from app.core import page_render
from app.core.config import settings
from app.core.storage import get_storage_provider
from app.models.resource import Resource
from app.services.errors import NotFoundError

PDF_TYPES = {"application/pdf"}
IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
TEXT_TYPES = {"text/plain"}
DOCX_TYPES = {
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
}


def extract_docx_text(data: bytes) -> str:
    """Extract human-readable paragraphs from a Word (.docx) document."""
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            xml_content = z.read("word/document.xml")
            tree = ET.fromstring(xml_content)
            paragraphs = []
            for p in tree.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p"):
                texts = [
                    node.text
                    for node in p.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t")
                    if node.text
                ]
                if texts:
                    paragraphs.append("".join(texts))
            return "\n\n".join(paragraphs) if paragraphs else "No readable text found in document."
    except Exception:
        return "Unable to parse Word document content for browser preview."


_MAX_TEXT_BYTES = 200_000
_CACHE_MAX_ENTRIES = 4
_CACHE_MAX_BYTES = 64 * 1024 * 1024

_cache_lock = threading.Lock()
_bytes_cache: "OrderedDict[tuple[str, str], bytes]" = OrderedDict()
_page_count_cache: dict[tuple[str, str], int] = {}


@dataclass(frozen=True)
class SourceFile:
    file_id: int | None
    storage_key: str
    storage_provider: str
    mime_type: str
    name: str
    checksum: str


@dataclass(frozen=True)
class PageRef:
    number: int  # 1-based, across all files
    kind: str  # "image" or "text"
    source_index: int
    page_in_source: int  # 0-based


def _normalise_mime(mime: str | None) -> str:
    return (mime or "").split(";")[0].strip().lower()


def resource_sources(resource: Resource) -> list[SourceFile]:
    """Ordered files of a resource, falling back to the legacy single-file columns."""
    files = sorted(resource.files, key=lambda item: (item.page_order, item.id))
    if files:
        return [
            SourceFile(
                file_id=item.id,
                storage_key=item.storage_key,
                storage_provider=item.storage_provider,
                mime_type=_normalise_mime(item.mime_type),
                name=item.original_filename,
                checksum=item.file_checksum_sha256 or "",
            )
            for item in files
        ]
    return [
        SourceFile(
            file_id=None,
            storage_key=resource.storage_path,
            storage_provider=resource.storage_provider,
            mime_type=_normalise_mime(resource.mime_type),
            name=resource.file_name,
            checksum=resource.file_checksum_sha256 or "",
        )
    ]


def content_version(sources: list[SourceFile]) -> str:
    """Changes whenever any file is replaced, so offline copies can be invalidated."""
    digest = hashlib.sha256()
    for src in sources:
        digest.update(f"{src.storage_key}:{src.checksum}|".encode())
    return digest.hexdigest()[:16]


def _read_source(src: SourceFile) -> bytes:
    cache_key = (src.storage_key, src.checksum)
    with _cache_lock:
        cached = _bytes_cache.get(cache_key)
        if cached is not None:
            _bytes_cache.move_to_end(cache_key)
            return cached

    provider = get_storage_provider(src.storage_provider)
    try:
        handle, _size = provider.read_file(src.storage_key)
    except (FileNotFoundError, OSError, ValueError) as exc:
        raise NotFoundError("Resource file not found.") from exc
    try:
        data = handle.read()
    finally:
        handle.close()

    if len(data) <= _CACHE_MAX_BYTES:
        with _cache_lock:
            _bytes_cache[cache_key] = data
            total = sum(len(item) for item in _bytes_cache.values())
            while _bytes_cache and (len(_bytes_cache) > _CACHE_MAX_ENTRIES or total > _CACHE_MAX_BYTES):
                _, evicted = _bytes_cache.popitem(last=False)
                total -= len(evicted)
    return data


def _pdf_page_count(src: SourceFile) -> int:
    cache_key = (src.storage_key, src.checksum)
    with _cache_lock:
        if cache_key in _page_count_cache:
            return _page_count_cache[cache_key]
    count = page_render.pdf_page_count(_read_source(src))
    with _cache_lock:
        if len(_page_count_cache) > 512:
            _page_count_cache.clear()
        _page_count_cache[cache_key] = count
    return count


def build_page_index(sources: list[SourceFile]) -> tuple[list[PageRef], list[str]]:
    """Return (pages, names_of_files_that_cannot_be_viewed_in_the_browser)."""
    pages: list[PageRef] = []
    skipped: list[str] = []
    for index, src in enumerate(sources):
        if src.mime_type in PDF_TYPES:
            try:
                count = _pdf_page_count(src)
            except page_render.PageRenderError:
                skipped.append(src.name)
                continue
            for page_in_source in range(count):
                pages.append(PageRef(len(pages) + 1, "image", index, page_in_source))
        elif src.mime_type in IMAGE_TYPES:
            pages.append(PageRef(len(pages) + 1, "image", index, 0))
        elif src.mime_type in TEXT_TYPES:
            pages.append(PageRef(len(pages) + 1, "text", index, 0))
        elif src.mime_type in DOCX_TYPES:
            pages.append(PageRef(len(pages) + 1, "text", index, 0))
        else:
            skipped.append(src.name)
        if len(pages) >= settings.viewer_max_pages:
            return pages[: settings.viewer_max_pages], skipped
    return pages, skipped


def render_page(sources: list[SourceFile], page: PageRef, watermark: str) -> tuple[bytes, str]:
    """Render one page. Returns (body, media_type)."""
    src = sources[page.source_index]
    data = _read_source(src)

    if page.kind == "text":
        if src.mime_type in DOCX_TYPES:
            text = extract_docx_text(data)
            return text.encode("utf-8"), "text/plain; charset=utf-8"
        text = data[:_MAX_TEXT_BYTES].decode("utf-8", errors="replace")
        return text.encode("utf-8"), "text/plain; charset=utf-8"

    if src.mime_type in PDF_TYPES:
        image = page_render.render_pdf_page(data, page.page_in_source, settings.viewer_page_scale)
    else:
        image = page_render.load_image(data)
    image = page_render.apply_watermark(image, watermark)
    return page_render.encode_jpeg(image), "image/jpeg"


def watermark_text(full_name: str | None, user_id: int) -> str:
    # "ID n" is pure ASCII, so the page stays traceable even if the name has no Latin glyphs.
    name = (full_name or "").strip()
    return f"{name} | ID {user_id}" if name else f"ID {user_id}"
