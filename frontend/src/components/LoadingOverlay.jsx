import React from 'react';

export default function LoadingOverlay({ message, subMessage }) {
    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.8)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
        }}>
            <div className="glass-panel animate-fade-in" style={{
                padding: '3rem',
                textAlign: 'center',
                maxWidth: '400px',
                width: '90%'
            }}>
                <div style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    border: '4px solid var(--border-color)',
                    borderTopColor: 'var(--accent-primary)',
                    margin: '0 auto 2rem auto'
                }} className="animate-spin"></div>

                <h3 style={{ marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
                    {message}
                </h3>

                {subMessage && (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                        {subMessage}
                    </p>
                )}
            </div>
        </div>
    );
}
