"""Text extraction module for PDF, DOCX and plain text files."""

import io
import pdfplumber
from docx import Document


def extract_text(file_bytes: bytes, filename: str) -> str:
    """Extract raw text from uploaded file based on its extension.

    Args:
        file_bytes: Raw bytes of the uploaded file.
        filename: Original filename (used to determine type).

    Returns:
        Extracted plain text.

    Raises:
        ValueError: If file type is not supported.
    """
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext == "pdf":
        return _extract_pdf(file_bytes)
    elif ext == "docx":
        return _extract_docx(file_bytes)
    elif ext in ("txt", "text", "md"):
        return file_bytes.decode("utf-8", errors="replace")
    else:
        raise ValueError(
            f"Nicht unterstütztes Dateiformat: .{ext}  "
            f"(Erlaubt: PDF, DOCX, TXT)"
        )


def _extract_pdf(file_bytes: bytes) -> str:
    """Extract text from a PDF file."""
    text_parts: list[str] = []
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)

    result = "\n\n".join(text_parts).strip()
    if not result:
        raise ValueError(
            "PDF enthält keinen extrahierbaren Text. "
            "Möglicherweise ein gescanntes Dokument."
        )
    return result


def _extract_docx(file_bytes: bytes) -> str:
    """Extract text from a DOCX file."""
    doc = Document(io.BytesIO(file_bytes))
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    result = "\n".join(paragraphs).strip()
    if not result:
        raise ValueError("DOCX-Datei enthält keinen Text.")
    return result
