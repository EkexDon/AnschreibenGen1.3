import { useState } from 'react';
import { FileText, Briefcase, Settings, Download, AlertCircle } from 'lucide-react';
import FileUpload from './components/FileUpload';
import LoadingOverlay from './components/LoadingOverlay';

// Constants
const API_URL = '/api/generate';

function App() {
  const [cvFile, setCvFile] = useState(null);
  const [jobFile, setJobFile] = useState(null);
  const [jobText, setJobText] = useState('');

  const [anrede, setAnrede] = useState('Sehr geehrte Damen und Herren');
  const [tonalitaet, setTonalitaet] = useState('sachlich');

  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(null);

  const handleGenerate = async () => {
    if (!cvFile) {
      setError('Bitte Lebenslauf hochladen.');
      return;
    }
    if (!jobFile && !jobText.trim()) {
      setError('Bitte Stellenanzeige als Text eingeben oder hochladen.');
      return;
    }

    setError(null);
    setIsGenerating(true);

    const formData = new FormData();
    formData.append('cv_file', cvFile);
    if (jobFile) formData.append('job_file', jobFile);
    formData.append('job_text', jobText);
    formData.append('anrede', anrede);
    formData.append('tonalitaet', tonalitaet);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 min timeout

      const response = await fetch(API_URL, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorMsg = 'Fehler bei der Generierung.';
        try {
          const errorData = await response.json();
          errorMsg = errorData.detail || errorMsg;
        } catch { /* response wasn't JSON */ }
        throw new Error(errorMsg);
      }

      // Handle PDF download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Bewerbungsanschreiben.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      // Attempt cleanup call (fire & forget)
      const jobId = response.headers.get('X-Job-Id');
      if (jobId) {
        fetch(`/api/cleanup/${jobId}`, { method: 'DELETE' }).catch(console.error);
      }

    } catch (err) {
      if (err.name === 'AbortError') {
        setError('Zeitüberschreitung – die Generierung hat zu lange gedauert. Bitte erneut versuchen.');
      } else if (err.message === 'Failed to fetch') {
        setError('Verbindung zum Server fehlgeschlagen. Bitte stelle sicher, dass der Backend-Server läuft (Port 8001).');
      } else {
        setError(err.message);
      }
    } finally {
      setIsGenerating(false);
    }

  };

  return (
    <div className="container">
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <h1 className="animate-fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
          <FileText size={40} color="var(--accent-primary)" />
          KI-Anschreibung
        </h1>
        <p className="subtitle animate-fade-in" style={{ animationDelay: '0.1s' }}>
          Perfekte Anschreiben in Sekunden – basierend auf deinem Lebenslauf und der Stellenanzeige.
        </p>
      </div>

      {/* Main Form */}
      <div className="glass-panel animate-fade-in" style={{ padding: '2rem', animationDelay: '0.2s' }}>

        {/* Step 1: CV */}
        <section style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', fontSize: '1.25rem' }}>
            <span style={{
              background: 'var(--accent-primary)', color: 'white',
              width: '24px', height: '24px', borderRadius: '50%',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.875rem'
            }}>1</span>
            Dein Lebenslauf
          </h2>
          <FileUpload
            file={cvFile}
            onFileSelect={setCvFile}
            onClear={() => setCvFile(null)}
            accept=".pdf,.docx,.txt"
            label="Lade deinen aktuellen Lebenslauf als PDF oder DOCX hoch"
            helpText="Wir extrahieren deine Stationen und Skills automatisch."
          />
        </section>

        <div style={{ height: '1px', background: 'var(--border-color)', margin: '2rem 0' }}></div>

        {/* Step 2: Job */}
        <section style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', fontSize: '1.25rem' }}>
            <span style={{
              background: 'var(--accent-primary)', color: 'white',
              width: '24px', height: '24px', borderRadius: '50%',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.875rem'
            }}>2</span>
            Die Stellenanzeige
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
            <div>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Briefcase size={16} /> Text einfügen
              </label>
              <textarea
                className="form-control"
                rows="6"
                placeholder="Füge hier den Text der Stellenanzeige ein..."
                value={jobText}
                onChange={(e) => setJobText(e.target.value)}
                style={{ resize: 'vertical' }}
              ></textarea>
            </div>

            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              — ODER —
            </div>

            <FileUpload
              file={jobFile}
              onFileSelect={setJobFile}
              onClear={() => setJobFile(null)}
              accept=".pdf,.docx,.txt"
              label="Stellenanzeige als PDF hochladen"
              helpText="Optional, falls du sie als Datei hast."
            />
          </div>
        </section>

        <div style={{ height: '1px', background: 'var(--border-color)', margin: '2rem 0' }}></div>

        {/* Step 3: Options */}
        <section style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', fontSize: '1.25rem' }}>
            <span style={{
              background: 'var(--accent-primary)', color: 'white',
              width: '24px', height: '24px', borderRadius: '50%',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.875rem'
            }}>3</span>
            Optionen
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                Anrede
              </label>
              <input
                type="text"
                className="form-control"
                value={anrede}
                onChange={(e) => setAnrede(e.target.value)}
                placeholder="z.B. Sehr geehrte Frau Bauer"
              />
            </div>

            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Settings size={16} /> Tonalität
              </label>
              <select
                className="form-control"
                value={tonalitaet}
                onChange={(e) => setTonalitaet(e.target.value)}
              >
                <option value="sachlich">Sachlich & Professionell</option>
                <option value="motiviert">Motiviert & Engagiert</option>
                <option value="technisch">Technisch & Fachlich</option>
              </select>
            </div>
          </div>
        </section>

        {/* Error Message */}
        {error && (
          <div className="animate-fade-in" style={{
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid var(--error)',
            color: '#fca5a5',
            padding: '1rem', borderRadius: '8px',
            marginBottom: '1.5rem',
            display: 'flex', alignItems: 'flex-start', gap: '0.75rem'
          }}>
            <AlertCircle size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <p style={{ fontWeight: 500, marginBottom: '0.25rem' }}>Fehler bei der Generierung</p>
              <p style={{ fontSize: '0.875rem' }}>{error}</p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          <button
            className="btn btn-primary"
            style={{ width: '100%', maxWidth: '400px', padding: '1rem', fontSize: '1.125rem' }}
            onClick={handleGenerate}
            disabled={isGenerating || !cvFile || (!jobFile && !jobText.trim())}
          >
            <Download size={20} />
            Anschreiben als PDF generieren
          </button>
          <p style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Die Generierung dauert in der Regel 10-20 Sekunden.
          </p>
        </div>

      </div>

      {isGenerating && (
        <LoadingOverlay
          message="Analysiere Dokumente..."
          subMessage="Die KI schreibt dein perfektes Anschreiben und rendert das PDF."
        />
      )}
    </div>
  );
}

export default App;
