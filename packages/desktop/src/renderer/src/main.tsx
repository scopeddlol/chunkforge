import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { initApiClient } from './api'
import './styles.css'

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement)

// Every page calls the API on mount, so the client has to exist before the
// first render — otherwise components race the connection and throw.
initApiClient()
  .then(() => {
    root.render(
      <React.StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </React.StrictMode>
    )
  })
  .catch((err: Error) => {
    // Without the API there is no app, so say so plainly rather than showing an
    // empty window.
    root.render(
      <div style={{ padding: 32, fontFamily: 'Segoe UI, sans-serif', color: '#E8E6EA' }}>
        <h2>Chunkforge could not start</h2>
        <p>The local Chunkforge service did not come up.</p>
        <pre style={{ whiteSpace: 'pre-wrap', opacity: 0.7 }}>{err.message}</pre>
      </div>
    )
  })
