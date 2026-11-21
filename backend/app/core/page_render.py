"""Server-side page rendering for the secure viewer.

Students never receive the original PDF. Each page is rasterised on the server,
stamped with a per-student watermark and sent as a JPEG. This keeps the original
file private and makes any leaked page traceable to an account.

This module deliberately imports nothing from the rest of the app.
"""

from __future__ import annotations

import io
import unicodedata

import pypdfium2 as pdfium
from PIL import Image, ImageDraw, ImageFont, ImageOps

# Guard against decompression bombs and absurdly large renders.
MAX_IMAGE_PIXELS = 60_000_000
MAX_RENDER_SIDE = 2600
Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS


class PageRenderError(ValueError):
    """Raised when a document cannot be rendered."""


def pdf_page_count(data: bytes) -> int:
    try:
        pdf = pdfium.PdfDocument(data)
    except Exception as exc:  # pdfium raises PdfiumError for corrupt/encrypted files
        raise PageRenderError("The PDF could not be opened.") from exc
    try:
        return len(pdf)
    finally:
        pdf.close()


def render_pdf_page(data: bytes, index: int, scale: float = 1.6) -> Image.Image:
    try:
        pdf = pdfium.PdfDocument(data)
    except Exception as exc:
        raise PageRenderError("The PDF could not be opened.") from exc
    try:
        if index < 0 or index >= len(pdf):
            raise PageRenderError("Page not found.")
        page = pdf[index]
        width, height = page.get_size()
        longest = max(width, height) * scale
        if longest > MAX_RENDER_SIDE:
            scale = scale * (MAX_RENDER_SIDE / longest)
        image = page.render(scale=scale).to_pil()
        return image.convert("RGB")
    finally:
        pdf.close()


def load_image(data: bytes) -> Image.Image:
    try:
        image = Image.open(io.BytesIO(data))
        image = ImageOps.exif_transpose(image)
        image.load()
    except Exception as exc:
        raise PageRenderError("The image could not be opened.") from exc
    if image.mode in ("RGBA", "LA", "P"):
        background = Image.new("RGB", image.size, "white")
        rgba = image.convert("RGBA")
        background.paste(rgba, mask=rgba.split()[-1])
        image = background
    else:
        image = image.convert("RGB")
    longest = max(image.size)
    if longest > MAX_RENDER_SIDE:
        ratio = MAX_RENDER_SIDE / longest
        image = image.resize((int(image.width * ratio), int(image.height * ratio)), Image.LANCZOS)
    return image


def apply_watermark(image: Image.Image, text: str) -> Image.Image:
    """Tile faint diagonal text across the page."""
    # The bundled font only covers basic Latin, so fold accents and drop the rest.
    text = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode().strip()
    if not text:
        return image
    base = image.convert("RGBA")
    font_size = max(16, base.width // 34)
    try:
        font = ImageFont.load_default(size=font_size)
    except TypeError:  # very old Pillow without sized default font
        font = ImageFont.load_default()

    probe = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    left, top, right, bottom = probe.textbbox((0, 0), text, font=font)
    tile_w, tile_h = right - left + 40, bottom - top + 30
    tile = Image.new("RGBA", (tile_w, tile_h), (0, 0, 0, 0))
    ImageDraw.Draw(tile).text((20 - left, 15 - top), text, font=font, fill=(80, 80, 80, 85))
    tile = tile.rotate(28, expand=True, resample=Image.BICUBIC)

    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    step_x, step_y = int(tile.width * 1.05), int(tile.height * 1.25)
    for row, y in enumerate(range(-tile.height, base.height + tile.height, step_y)):
        offset = (row % 2) * (step_x // 2)
        for x in range(-tile.width + offset, base.width + tile.width, step_x):
            _paste_clipped(layer, tile, x, y)
    return Image.alpha_composite(base, layer).convert("RGB")


def _paste_clipped(layer: Image.Image, tile: Image.Image, x: int, y: int) -> None:
    if x + tile.width <= 0 or y + tile.height <= 0 or x >= layer.width or y >= layer.height:
        return
    layer.paste(tile, (x, y), tile)


def encode_jpeg(image: Image.Image, quality: int = 78) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=quality, optimize=True)
    return buffer.getvalue()
