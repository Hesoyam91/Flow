import React from 'react'
import { createRoot } from 'react-dom/client'
import '@xyflow/react/dist/style.css'
import './styles.css'
import App from './App.jsx'
import i18n from './i18n'

// Envía los errores al registro local del proceso principal (si la app de escritorio está disponible).
const reportError = (error) => window.flowFiles?.logError?.(String(error?.stack || error?.message || error)).catch(() => {})
window.addEventListener('error', (e) => reportError(e.error || e.message))
window.addEventListener('unhandledrejection', (e) => reportError(e.reason))

// Evita la pantalla en blanco: ante un error permite reintentar o descartar el autoguardado local.
class ErrorBoundary extends React.Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    console.error('Error en la interfaz:', error)
    reportError(error)
  }

  reset = () => {
    localStorage.removeItem('flow:autosave')
    window.location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="crash">
        <h2>{i18n.t('crash.title')}</h2>
        <p>{i18n.t('crash.body')}</p>
        <pre>{String(this.state.error?.message || this.state.error)}</pre>
        <div className="crash-actions">
          <button onClick={() => window.location.reload()}>{i18n.t('crash.retry')}</button>
          <button onClick={this.reset}>{i18n.t('crash.reset')}</button>
        </div>
      </div>
    )
  }
}

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
)
