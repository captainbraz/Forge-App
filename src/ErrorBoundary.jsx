import React from 'react';

// Reads storage directly rather than through app state, since app state may be exactly
// what's corrupted/crashing — this must work even when the rest of the app can't render.
function downloadRawBackup() {
  try {
    const bundle = { exportedAt: new Date().toISOString(), recoveredFromCrash: true, data: {} };
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      try { bundle.data[key] = JSON.parse(localStorage.getItem(key)); } catch { bundle.data[key] = localStorage.getItem(key); }
    }
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `forge-crash-backup-${Date.now()}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    window.alert('Could not create a backup file: ' + e.message);
  }
}

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('Forge crashed:', error, info);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ minHeight: '100vh', background: '#18181b', color: '#f4f4f5', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ maxWidth: 380, margin: '0 auto' }}>
          <h1 style={{ fontSize: 20, fontWeight: 900, textTransform: 'uppercase', marginBottom: 8 }}>Something broke</h1>
          <p style={{ fontSize: 13, color: '#a1a1aa', marginBottom: 16 }}>
            Forge hit an error it couldn't recover from. Your data is still on this device — download a backup before reloading, just in case.
          </p>
          <button
            onClick={downloadRawBackup}
            style={{ width: '100%', padding: '10px 0', borderRadius: 6, background: '#2dd4bf', color: '#18181b', fontWeight: 700, textTransform: 'uppercase', fontSize: 12, letterSpacing: '0.05em', border: 'none', marginBottom: 10 }}
          >
            Download backup
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{ width: '100%', padding: '10px 0', borderRadius: 6, background: '#3f3f46', color: '#f4f4f5', fontWeight: 700, textTransform: 'uppercase', fontSize: 12, letterSpacing: '0.05em', border: 'none' }}
          >
            Reload app
          </button>
          <p style={{ fontSize: 11, color: '#71717a', marginTop: 16, fontFamily: 'monospace', wordBreak: 'break-word' }}>{String(this.state.error?.message || this.state.error)}</p>
        </div>
      </div>
    );
  }
}
