import { Component, type ReactNode } from 'react';

/** A render crash shows what happened instead of a blank window. The data on the device is untouched. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(error);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div style={{ fontFamily: 'Nunito, sans-serif', padding: 32, color: '#2D312E', maxWidth: 640 }}>
        <h1 style={{ fontFamily: 'Fredoka, sans-serif' }}>Pomo tripped over something 🍅</h1>
        <p>Your data is safe on this device. Reloading usually fixes it.</p>
        <button onClick={() => location.reload()} style={{ padding: '8px 16px', borderRadius: 999, border: '1px solid #ccc', cursor: 'pointer' }}>
          Reload
        </button>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, opacity: 0.6, marginTop: 16 }}>{String(error.stack ?? error)}</pre>
      </div>
    );
  }
}
