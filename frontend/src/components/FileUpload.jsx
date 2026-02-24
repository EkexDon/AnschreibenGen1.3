import React, { useRef, useState } from 'react';
import { UploadCloud, File, CheckCircle, X } from 'lucide-react';

export default function FileUpload({ file, onFileSelect, onClear, accept, label, helpText }) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      validateAndSelect(droppedFile);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndSelect(e.target.files[0]);
    }
  };

  const validateAndSelect = (selectedFile) => {
    // Basic validation based on accept attr if needed
    onFileSelect(selectedFile);
  };

  const handleClick = () => {
    if (!file) {
      fileInputRef.current?.click();
    }
  };

  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div 
        className={`upload-area ${isDragging ? 'dragging' : ''} ${file ? 'has-file' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        style={{
          border: `2px dashed ${isDragging ? 'var(--accent-primary)' : 'var(--border-color)'}`,
          borderRadius: '12px',
          padding: '2rem',
          textAlign: 'center',
          cursor: file ? 'default' : 'pointer',
          backgroundColor: isDragging ? 'rgba(59, 130, 246, 0.05)' : 'rgba(15, 23, 42, 0.4)',
          transition: 'all 0.2s',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
          accept={accept} 
          style={{ display: 'none' }} 
        />
        
        {!file ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <div style={{ 
              width: '48px', height: '48px', 
              borderRadius: '50%', 
              backgroundColor: 'rgba(51, 65, 85, 0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <UploadCloud size={24} color="var(--text-secondary)" />
            </div>
            <div>
              <p style={{ fontWeight: 500, marginBottom: '0.25rem' }}>Datei hier ablegen oder klicken</p>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{helpText}</p>
            </div>
          </div>
        ) : (
          <div style={{ 
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            padding: '1rem', borderRadius: '8px',
            border: '1px solid rgba(16, 185, 129, 0.2)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', overflow: 'hidden' }}>
              <File size={24} color="var(--success)" />
              <div style={{ textAlign: 'left', overflow: 'hidden' }}>
                <p style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {file.name}
                </p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CheckCircle size={20} color="var(--success)" />
              <button 
                type="button"
                onClick={(e) => { e.stopPropagation(); onClear(); }}
                style={{
                  background: 'none', border: 'none', 
                  color: 'var(--text-secondary)', cursor: 'pointer',
                  padding: '4px', borderRadius: '4px', display: 'flex'
                }}
                onMouseOver={(e) => e.currentTarget.style.color = 'var(--error)'}
                onMouseOut={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
              >
                <X size={18} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
