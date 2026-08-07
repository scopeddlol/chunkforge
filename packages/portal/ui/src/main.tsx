import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { FluentProvider } from '@fluentui/react-components'
import { App } from './App'
import { portalTheme } from './theme'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FluentProvider theme={portalTheme} style={{ height: '100%' }}>
      <App />
    </FluentProvider>
  </StrictMode>
)
