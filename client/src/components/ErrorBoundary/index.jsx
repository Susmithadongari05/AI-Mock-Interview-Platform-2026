import { Component } from 'react';

// Catches render-time crashes anywhere below it so the user sees a recoverable message
// instead of a blank white screen.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('UI crashed:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" style={{ maxWidth: 520, margin: '15vh auto', padding: 24, textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <h2>Something went wrong displaying this page</h2>
        <p style={{ color: '#555' }}>Your data is safe. Reload the page, or go back to the dashboard.</p>
        <button type="button" onClick={() => window.location.reload()} style={{ marginRight: 8, padding: '8px 16px' }}>Reload</button>
        <button type="button" onClick={() => window.location.assign('/')} style={{ padding: '8px 16px' }}>Dashboard</button>
      </div>
    );
  }
}

export default ErrorBoundary;
