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
        <div className="workspace-error">
          <div className="workspace-error__card">
            <h1>Κάτι πήγε στραβά</h1>
            <p>{this.state.error?.message || 'Unexpected error'}</p>
            <div className="workspace-error__actions">
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => window.location.reload()}
              >
                Επανεκκίνηση
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
