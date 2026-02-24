"""LaTeX → PDF compiler."""

import os
import subprocess
import tempfile
import uuid
from pathlib import Path

# Directory for generated PDFs
OUTPUT_DIR = Path(tempfile.gettempdir()) / "ki_anschreibung"
OUTPUT_DIR.mkdir(exist_ok=True)


def compile_latex(tex_source: str) -> Path:
    """Compile LaTeX source to PDF using pdflatex.

    Args:
        tex_source: Complete LaTeX source code.

    Returns:
        Path to the generated PDF file.

    Raises:
        RuntimeError: If pdflatex fails.
    """
    job_id = uuid.uuid4().hex[:12]
    work_dir = OUTPUT_DIR / job_id
    work_dir.mkdir(parents=True, exist_ok=True)

    tex_file = work_dir / "anschreiben.tex"
    pdf_file = work_dir / "anschreiben.pdf"

    tex_file.write_text(tex_source, encoding="utf-8")

    # Run pdflatex twice (for references, though usually not needed here)
    for run in range(2):
        try:
            result = subprocess.run(
                [
                    "pdflatex",
                    "-interaction=nonstopmode",
                    "-halt-on-error",
                    "-output-directory", str(work_dir),
                    str(tex_file),
                ],
                capture_output=True,
                text=True,
                timeout=120,
                cwd=str(work_dir),
            )
        except FileNotFoundError:
            raise RuntimeError(
                "pdflatex wurde nicht gefunden. Bitte installiere eine LaTeX-Distribution "
                "(z.B. MiKTeX: https://miktex.org/download) und stelle sicher, dass "
                "pdflatex im PATH verfügbar ist."
            )
        except subprocess.TimeoutExpired:
            raise RuntimeError(
                "pdflatex-Kompilierung hat zu lange gedauert (Timeout). "
                "Beim ersten Start installiert MiKTeX ggf. fehlende Pakete – bitte erneut versuchen."
            )

        if result.returncode != 0 and run == 1:
            # Extract useful error from log
            log_file = work_dir / "anschreiben.log"
            error_lines = []
            if log_file.exists():
                for line in log_file.read_text(encoding="utf-8", errors="replace").splitlines():
                    if line.startswith("!") or "Error" in line:
                        error_lines.append(line)

            error_msg = "\n".join(error_lines[:5]) if error_lines else result.stderr[:500]
            raise RuntimeError(
                f"pdflatex-Kompilierung fehlgeschlagen:\n{error_msg}"
            )

    if not pdf_file.exists():
        raise RuntimeError("PDF wurde nicht erzeugt – unbekannter LaTeX-Fehler.")

    return pdf_file


def cleanup_job(pdf_path: Path) -> None:
    """Remove all files for a completed job."""
    import shutil
    job_dir = pdf_path.parent
    if job_dir.exists() and str(job_dir).startswith(str(OUTPUT_DIR)):
        shutil.rmtree(job_dir, ignore_errors=True)
