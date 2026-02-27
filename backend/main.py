"""KI-Anschreibung – FastAPI Backend.

Generates cover letters from CV + job description using Google Gemini API and LaTeX.
"""

import asyncio
import logging
import os
from pathlib import Path

from dotenv import load_dotenv

# Load environment variables (local or Render secrets)
env_path = Path(__file__).parent / ".env"
render_secret_path = Path("/etc/secrets/.env")

if render_secret_path.exists():
    load_dotenv(render_secret_path)
else:
    load_dotenv(env_path)

from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from extractor import extract_text
from generator import generate_cover_letter
from compiler import compile_latex, cleanup_job

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ki-anschreibung")

# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
app = FastAPI(
    title="KI-Anschreibung",
    description="Generiert Bewerbungsanschreiben aus Lebenslauf + Stellenanzeige",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
ALLOWED_EXTENSIONS = {"pdf", "docx", "txt", "text", "md"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _validate_file(upload: UploadFile) -> None:
    """Validate uploaded file type."""
    if not upload.filename:
        raise HTTPException(400, "Dateiname fehlt.")
    ext = upload.filename.rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            400,
            f"Nicht unterstütztes Format: .{ext}  (Erlaubt: {', '.join(ALLOWED_EXTENSIONS)})",
        )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.post("/api/generate")
async def generate(
    cv_file: UploadFile = File(..., description="Lebenslauf (PDF/DOCX/TXT)"),
    job_file: UploadFile | None = File(None, description="Stellenanzeige als Datei (optional)"),
    job_text: str = Form("", description="Stellenanzeige als Text"),
    anrede: str = Form("Sehr geehrte Damen und Herren", description="Anrede"),
    tonalitaet: str = Form("sachlich", description="Tonalität: sachlich / motiviert / technisch"),
):
    """Generate a cover letter PDF from CV + job description."""

    # --- Validate CV ---
    _validate_file(cv_file)
    cv_bytes = await cv_file.read()
    if len(cv_bytes) > MAX_FILE_SIZE:
        raise HTTPException(400, "Datei zu groß (max. 10 MB).")

    # --- Extract CV text ---
    try:
        cv_text = extract_text(cv_bytes, cv_file.filename)
    except ValueError as e:
        raise HTTPException(400, str(e))

    logger.info("CV extrahiert: %d Zeichen", len(cv_text))

    # --- Get job description ---
    job_description = job_text.strip()
    if job_file and job_file.filename:
        _validate_file(job_file)
        job_bytes = await job_file.read()
        if len(job_bytes) > MAX_FILE_SIZE:
            raise HTTPException(400, "Stellenanzeige-Datei zu groß (max. 10 MB).")
        try:
            job_description = extract_text(job_bytes, job_file.filename)
        except ValueError as e:
            raise HTTPException(400, str(e))

    if not job_description:
        raise HTTPException(400, "Stellenanzeige fehlt – bitte Text eingeben oder Datei hochladen.")

    logger.info("Stellenanzeige: %d Zeichen", len(job_description))

    # --- Generate LaTeX via Gemini ---
    try:
        latex_code = await generate_cover_letter(
            cv_text=cv_text,
            job_text=job_description,
            anrede=anrede,
            tonalitaet=tonalitaet,
        )
    except RuntimeError as e:
        logger.error("Gemini-Fehler: %s", e)
        raise HTTPException(502, f"KI-Fehler: {e}")
    except Exception as e:
        logger.error("Unerwarteter Fehler bei Generierung: %s", e)
        raise HTTPException(500, "Interner Fehler bei der Anschreiben-Generierung.")

    logger.info("LaTeX generiert: %d Zeichen", len(latex_code))

    # --- Compile LaTeX → PDF ---
    try:
        pdf_path = await asyncio.to_thread(compile_latex, latex_code)
    except RuntimeError as e:
        logger.error("LaTeX-Kompilierung fehlgeschlagen: %s", e)
        raise HTTPException(
            502,
            f"LaTeX-Kompilierungsfehler: {e}. "
            "Das kann passieren, wenn die KI ungültigen LaTeX-Code erzeugt.",
        )

    logger.info("PDF erzeugt: %s", pdf_path)

    # --- Return PDF ---
    return FileResponse(
        path=str(pdf_path),
        media_type="application/pdf",
        filename="Bewerbungsanschreiben.pdf",
        headers={"X-Job-Id": pdf_path.parent.name},
    )


@app.delete("/api/cleanup/{job_id}")
async def cleanup(job_id: str):
    """Cleanup temporary files for a job (called by frontend after download)."""
    from compiler import OUTPUT_DIR
    job_dir = OUTPUT_DIR / job_id
    if job_dir.exists():
        import shutil
        shutil.rmtree(job_dir, ignore_errors=True)
    return {"status": "cleaned"}


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
