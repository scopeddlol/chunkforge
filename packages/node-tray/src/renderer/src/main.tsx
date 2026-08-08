import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { FluentProvider } from '@fluentui/react-components'
import { nodeTheme } from './theme'
import { App } from './App'
import './styles.css'

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <FluentProvider theme={nodeTheme}>
      <App />
    </FluentProvider>
  </StrictMode>
)
