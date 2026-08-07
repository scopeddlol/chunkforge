import { Component, type ErrorInfo, type PropsWithChildren, type ReactNode } from 'react'

interface ErrorBoundaryState {
  error: Error | null
  componentStack: string | null
}

// Without this, any render error unmounts the tree and leaves the user staring
// at the bare window background with no indication of what went wrong.
export class ErrorBoundary extends Component<PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, componentStack: null }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Chunkforge renderer crash:', error, info.componentStack)
    this.setState({ componentStack: info.componentStack ?? null })
  }

  render(): ReactNode {
    const { error, componentStack } = this.state
    if (!error) return this.props.children

    return (
      <div
        style={{
          padding: '32px',
          fontFamily: "'Segoe UI Variable', 'Segoe UI', sans-serif",
          color: '#F4F2F7',
          backgroundColor: '#0C0A11',
          height: '100vh',
          overflow: 'auto'
        }}
      >
        <h2 style={{ color: '#E0475E' }}>Something broke in the interface</h2>
        <p style={{ color: '#A9A2B8' }}>
          The error below is a bug in Chunkforge. Restarting the app will clear it.
        </p>
        <pre
          style={{
            whiteSpace: 'pre-wrap',
            background: '#000',
            padding: '14px',
            borderRadius: '8px',
            fontSize: '12.5px'
          }}
        >
          {error.message}
          {'\n\n'}
          {error.stack}
          {componentStack ? `\n\nComponent stack:${componentStack}` : ''}
        </pre>
      </div>
    )
  }
}
