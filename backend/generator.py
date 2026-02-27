"""Cover letter generator using Google Gemini API."""

import os
import re
import logging
from datetime import datetime
from pathlib import Path

from google import genai
from google.genai import types
from dotenv import load_dotenv

# Load environment variables (local or Render secrets)
env_path = Path(__file__).parent / ".env"

logger = logging.getLogger("ki-anschreibung.generator")
render_secret_path = Path("/etc/secrets/.env")

if render_secret_path.exists():
    load_dotenv(render_secret_path)
else:
    load_dotenv(env_path)

# ---------------------------------------------------------------------------
# Gemini client
# ---------------------------------------------------------------------------
_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError(
                "GEMINI_API_KEY ist nicht gesetzt. "
                "Bitte in .env eintragen (kostenlos: https://aistudio.google.com/apikey)"
            )
        _client = genai.Client(api_key=api_key)
    return _client


MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

# ---------------------------------------------------------------------------
# LaTeX template
# ---------------------------------------------------------------------------
_TEMPLATE_PATH = Path(__file__).parent / "template.tex"
_TEMPLATE = _TEMPLATE_PATH.read_text(encoding="utf-8")

# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = r"""Du bist ein professioneller Bewerbungsassistent für den deutschen Arbeitsmarkt.

Deine EINZIGE Aufgabe: Erstelle ein Bewerbungsanschreiben als **reinen LaTeX-Code**, 
der exakt die folgende Vorlage verwendet. Du darfst NUR die Platzhalter (<<...>>) ersetzen.

REGELN:
1. Maximal 1 DIN-A4-Seite – halte den Text KURZ (ca. 150-200 Wörter im Haupttext)
2. Sachlich-professionelle Sprache, KEINE Floskeln
3. Klare, aktive Formulierungen
4. Fokus auf fachliche Passung zwischen Lebenslauf und Stelle
5. Gib NUR LaTeX-Code aus – KEINE Erklärungen, KEIN Markdown, KEINE ```-Blöcke
6. Verwende KEINE LaTeX-Sonderzeichen falsch – escape & als \& und % als \% und # als \# und _ als \_
7. Falls Informationen fehlen (z.B. Adresse), verwende sinnvolle Platzhalter wie "[Deine Straße]"
8. Das Datum soll das aktuelle Datum sein oder "[Datum]" falls unbekannt
9. WICHTIG: Gib das KOMPLETTE Dokument aus, inkl. \documentclass... am Anfang und \end{document} am Ende.

VORLAGE:
""" + _TEMPLATE

# ---------------------------------------------------------------------------
# Tone mapping
# ---------------------------------------------------------------------------
TONE_INSTRUCTIONS = {
    "sachlich": "Ton: Sachlich und professionell. Faktenbasiert, nüchtern, ohne Emotionen.",
    "motiviert": "Ton: Motiviert und engagiert. Zeige Begeisterung für die Stelle, aber bleibe professionell.",
    "technisch": "Ton: Technisch und fachlich. Betone technische Skills und Projekterfahrung.",
}


async def generate_cover_letter(
    cv_text: str,
    job_text: str,
    anrede: str = "Sehr geehrte Damen und Herren",
    tonalitaet: str = "sachlich",
) -> str:
    """Generate a LaTeX cover letter using Google Gemini.

    Args:
        cv_text: Extracted text from the CV.
        job_text: Job description text.
        anrede: Salutation to use.
        tonalitaet: Tone – sachlich / motiviert / technisch.

    Returns:
        Complete LaTeX source code for the cover letter.
    """
    tone_instruction = TONE_INSTRUCTIONS.get(tonalitaet, TONE_INSTRUCTIONS["sachlich"])

    user_prompt = f"""Lebenslauf:
{cv_text}

---

Stellenanzeige:
{job_text}

---

Anrede: {anrede}
Aktuelles Datum f\u00fcr das Anschreiben: {datetime.today().strftime('%d.%m.%Y')}
{tone_instruction}

Erstelle jetzt das Bewerbungsanschreiben als reinen LaTeX-Code. Ersetze alle <<...>> Platzhalter."""

    client = _get_client()

    response = await client.aio.models.generate_content(
        model=MODEL,
        contents=user_prompt,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            temperature=0.4,
            max_output_tokens=4096,
        ),
    )

    latex_code = response.text.strip()
    
    # Extraction strategy:
    # 1. Look for full \documentclass ... \end{document}
    # 2. Look for \begin{document} ... \end{document} (if preamble is missing, we might need a fallback)
    # 3. Strip markdown fences if no structured LaTeX blocks were found
    
    full_match = re.search(r"(\\documentclass.*\\end\{document\})", latex_code, re.DOTALL)
    begin_match = re.search(r"(\\begin\{document\}.*\\end\{document\})", latex_code, re.DOTALL)
    
    if full_match:
        latex_code = full_match.group(1)
    elif begin_match:
        # If we have begin{document} but no documentclass, Gemini might have skipped the preamble.
        # We prepend the documentclass and packages from the template if it seems truly missing.
        body = begin_match.group(1)
        # Check if \documentclass is present before \begin{document} in the original raw response
        if r"\documentclass" not in latex_code[:begin_match.start()]:
            logger.warning("Gemini hat die Präambel weggelassen. Verwende Standard-Präambel aus Vorlage.")
            preamble = _TEMPLATE.split(r"\begin{document}")[0]
            latex_code = preamble + body
        else:
            # It was there, just maybe not captured by the strict re.DOTALL search
            latex_code = latex_code[latex_code.find(r"\documentclass"):begin_match.end()]
    else:
        # Fallback: Strip markdown code fences if present
        latex_code = re.sub(r"^```(?:latex|tex)?\s*\n", "", latex_code)
        latex_code = re.sub(r"\n```\s*$", "", latex_code)

    # Basic sanity check
    if r"\begin{document}" not in latex_code:
        # Log the full response for debugging if it's failing
        snippet = response.text[:500] + "..." if len(response.text) > 500 else response.text
        logger.error("Fehlerhaftes LaTeX von der KI: %s", response.text)
        raise RuntimeError(
            f"Das generierte LaTeX enthält kein \\begin{{document}}. "
            f"KI-Antwort (Auszug): {snippet}"
        )

    return latex_code
