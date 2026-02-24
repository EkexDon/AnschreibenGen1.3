import { GoogleGenerativeAI } from '@google/generative-ai';
import PDFDocument from 'pdfkit';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const ALLOWED_EXTENSIONS = new Set(['pdf', 'docx', 'txt', 'text', 'md']);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const DARK_GRAY = '#333333';
const ACCENT_BLUE = '#2B5797';

const TONE_INSTRUCTIONS = {
  sachlich: 'Ton: Sachlich und professionell. Faktenbasiert, nüchtern, ohne Emotionen.',
  motiviert: 'Ton: Motiviert und engagiert. Zeige Begeisterung für die Stelle, aber bleibe professionell.',
  technisch: 'Ton: Technisch und fachlich. Betone technische Skills und Projekterfahrung.',
};

const SYSTEM_PROMPT = `Du bist ein professioneller Bewerbungsassistent für den deutschen Arbeitsmarkt.

Deine EINZIGE Aufgabe: Erstelle ein Bewerbungsanschreiben als **reines JSON-Objekt** mit den folgenden Feldern.

REGELN:
1. Maximal 1 DIN-A4-Seite – halte den Text KURZ (ca. 150-200 Wörter im Haupttext)
2. Sachlich-professionelle Sprache, KEINE Floskeln
3. Klare, aktive Formulierungen
4. Fokus auf fachliche Passung zwischen Lebenslauf und Stelle
5. Gib NUR gültiges JSON aus – KEINE Erklärungen, KEIN Markdown
6. Falls Informationen fehlen (z.B. Adresse), verwende sinnvolle Platzhalter wie "[Deine Straße]"
7. Das Datum soll das aktuelle Datum sein oder "[Datum]" falls unbekannt
8. Der Haupttext (absaetze) soll aus 2-4 Absätzen bestehen

JSON-SCHEMA:
{
  "absender_name": "Vor- und Nachname des Bewerbers",
  "absender_strasse": "Straße und Hausnummer",
  "absender_ort": "PLZ Stadt",
  "absender_telefon": "Telefonnummer",
  "absender_email": "E-Mail-Adresse",
  "empfaenger_firma": "Firmenname",
  "empfaenger_abteilung": "Abteilung oder z.Hd. Ansprechpartner",
  "empfaenger_strasse": "Straße und Hausnummer",
  "empfaenger_ort": "PLZ Stadt",
  "datum": "TT.MM.JJJJ",
  "betreff": "Betreffzeile der Bewerbung",
  "anrede": "Anrede (z.B. Sehr geehrte Damen und Herren,)",
  "absaetze": ["Erster Absatz...", "Zweiter Absatz...", "..."],
  "grussformel": "Grußformel (z.B. Mit freundlichen Grüßen)"
}`;

// ---------------------------------------------------------------------------
// Text extraction
// ---------------------------------------------------------------------------
function getExtension(filename) {
  if (!filename || !filename.includes('.')) return '';
  return filename.split('.').pop().toLowerCase();
}

async function extractText(file) {
  const ext = getExtension(file.name);

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw Object.assign(
      new Error(`Nicht unterstütztes Format: .${ext} (Erlaubt: ${[...ALLOWED_EXTENSIONS].join(', ')})`),
      { status: 400 },
    );
  }

  const arrayBuf = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuf);

  if (buffer.length > MAX_FILE_SIZE) {
    throw Object.assign(new Error('Datei zu groß (max. 10 MB).'), { status: 400 });
  }

  if (ext === 'pdf') {
    const data = await pdfParse(buffer);
    if (!data.text.trim()) {
      throw Object.assign(
        new Error('PDF enthält keinen extrahierbaren Text. Möglicherweise ein gescanntes Dokument.'),
        { status: 400 },
      );
    }
    return data.text;
  }

  if (ext === 'docx') {
    const result = await mammoth.extractRawText({ buffer });
    if (!result.value.trim()) {
      throw Object.assign(new Error('DOCX-Datei enthält keinen Text.'), { status: 400 });
    }
    return result.value;
  }

  // txt, text, md
  return buffer.toString('utf-8');
}

// ---------------------------------------------------------------------------
// Gemini API – generate structured cover letter data
// ---------------------------------------------------------------------------
async function generateCoverLetter(cvText, jobText, anrede, tonalitaet) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw Object.assign(
      new Error('GEMINI_API_KEY ist nicht konfiguriert. Bitte als Umgebungsvariable in den Netlify-Einstellungen setzen.'),
      { status: 500 },
    );
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
    },
  });

  const toneInstruction = TONE_INSTRUCTIONS[tonalitaet] || TONE_INSTRUCTIONS.sachlich;
  const today = new Date().toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const prompt = `Lebenslauf:
${cvText}

---

Stellenanzeige:
${jobText}

---

Anrede: ${anrede}
Aktuelles Datum für das Anschreiben: ${today}
${toneInstruction}

Erstelle jetzt das Bewerbungsanschreiben als JSON-Objekt gemäß dem Schema.`;

  const result = await model.generateContent(prompt);
  let text = result.response.text().trim();

  // Strip markdown code fences if the model wrapped the output
  text = text.replace(/^```(?:json)?\s*\n/, '').replace(/\n```\s*$/, '');

  try {
    const data = JSON.parse(text);
    if (!data.absender_name || !data.betreff || !data.absaetze || !Array.isArray(data.absaetze)) {
      throw new Error('Missing required fields');
    }
    return data;
  } catch {
    throw Object.assign(
      new Error('Die KI hat ungültige Daten zurückgegeben. Bitte erneut versuchen.'),
      { status: 502 },
    );
  }
}

// ---------------------------------------------------------------------------
// PDF generation (DIN 5008 cover letter layout using pdfkit)
// ---------------------------------------------------------------------------
function createPDF(data) {
  return new Promise((resolve, reject) => {
    // A4: 595.28 x 841.89 points
    // Margins: left 25mm, right 20mm, top 27mm, bottom 25mm (1mm = 2.835pt)
    const doc = new PDFDocument({
      size: 'A4',
      margins: {
        top: 76.54,
        bottom: 70.87,
        left: 70.87,
        right: 56.69,
      },
      info: {
        Title: data.betreff || 'Bewerbungsanschreiben',
        Author: data.absender_name || '',
      },
    });

    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const contentWidth = 595.28 - 70.87 - 56.69;

    // -- Sender block --
    doc.fillColor(DARK_GRAY);
    doc.font('Helvetica-Bold').fontSize(14).text(data.absender_name || '');
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(10);
    if (data.absender_strasse) doc.text(data.absender_strasse);
    if (data.absender_ort) doc.text(data.absender_ort);
    doc.moveDown(0.2);
    if (data.absender_telefon) doc.text(data.absender_telefon);
    if (data.absender_email) doc.text(data.absender_email);

    doc.moveDown(1.5);

    // -- Recipient block --
    doc.font('Helvetica').fontSize(10);
    if (data.empfaenger_firma) doc.text(data.empfaenger_firma);
    if (data.empfaenger_abteilung) doc.text(data.empfaenger_abteilung);
    if (data.empfaenger_strasse) doc.text(data.empfaenger_strasse);
    if (data.empfaenger_ort) doc.text(data.empfaenger_ort);

    doc.moveDown(1.2);

    // -- Date (right-aligned) --
    doc.font('Helvetica').fontSize(10).text(data.datum || '', { align: 'right', width: contentWidth });

    doc.moveDown(0.8);

    // -- Subject line --
    doc.fillColor(ACCENT_BLUE).font('Helvetica-Bold').fontSize(12).text(data.betreff || '', { width: contentWidth });

    doc.moveDown(1.2);

    // -- Salutation --
    doc.fillColor(DARK_GRAY).font('Helvetica').fontSize(10).text(data.anrede || 'Sehr geehrte Damen und Herren,');

    doc.moveDown(0.5);

    // -- Body paragraphs --
    const paragraphs = data.absaetze || [];
    for (let i = 0; i < paragraphs.length; i++) {
      doc.font('Helvetica').fontSize(10).text(paragraphs[i], {
        lineGap: 3,
        width: contentWidth,
      });
      if (i < paragraphs.length - 1) {
        doc.moveDown(0.5);
      }
    }

    doc.moveDown(0.8);

    // -- Closing --
    doc.font('Helvetica').fontSize(10).text(data.grussformel || 'Mit freundlichen Grüßen');

    doc.moveDown(1.5);

    // -- Signature line --
    doc.font('Helvetica').fontSize(10).text(data.absender_name || '');

    doc.end();
  });
}

// ---------------------------------------------------------------------------
// Main handler (Netlify Functions v2)
// ---------------------------------------------------------------------------
export default async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ detail: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const formData = await req.formData();

    const cvFile = formData.get('cv_file');
    const jobFile = formData.get('job_file');
    const jobText = formData.get('job_text') || '';
    const anrede = formData.get('anrede') || 'Sehr geehrte Damen und Herren';
    const tonalitaet = formData.get('tonalitaet') || 'sachlich';

    // Validate CV file
    if (!cvFile || typeof cvFile === 'string') {
      throw Object.assign(new Error('Bitte Lebenslauf hochladen.'), { status: 400 });
    }

    // Extract text from CV
    const cvText = await extractText(cvFile);

    // Get job description (from file or text input)
    let jobDescription = jobText.trim();
    if (jobFile && typeof jobFile !== 'string' && jobFile.name) {
      jobDescription = await extractText(jobFile);
    }

    if (!jobDescription) {
      throw Object.assign(
        new Error('Stellenanzeige fehlt – bitte Text eingeben oder Datei hochladen.'),
        { status: 400 },
      );
    }

    // Generate cover letter content via Gemini
    const letterData = await generateCoverLetter(cvText, jobDescription, anrede, tonalitaet);

    // Render PDF
    const pdfBuffer = await createPDF(letterData);

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="Bewerbungsanschreiben.pdf"',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    console.error('Generate error:', err);
    const status = err.status || 500;
    const message = err.message || 'Interner Fehler bei der Verarbeitung.';
    return new Response(JSON.stringify({ detail: message }), {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
};

export const config = {
  path: '/api/generate',
};
