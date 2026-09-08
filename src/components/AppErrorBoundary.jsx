import { Component } from 'react';

export class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('App crash:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#050505', color: '#f5f5f5', fontFamily: 'sans-serif' }}>
          <div style={{ maxWidth: 480, padding: 28, borderRadius: 16, background: '#111', border: '1px solid #333', textAlign: 'center' }}>
            <h1 style={{ margin: '0 0 12px', fontSize: '1.25rem' }}>Κάτι πήγε στραβά</h1>
            <p style={{ margin: '0 0 20px', color: '#aaa', lineHeight: 1.5 }}>{this.state.error?.message || 'Unexpected error'}</p>
            <button
              type="button"
              style={{ padding: '8px 16px', borderRadius: 8, border: 0, background: '#10b981', color: '#022c22', fontWeight: 700, cursor: 'pointer' }}
              onClick={() => window.location.reload()}
            >
              Επανεκκίνηση
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
