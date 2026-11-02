import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// En la compilación final se inyecta una CSP estricta (sin scripts inline ni eval, sin red).
// En desarrollo no se aplica porque el servidor de Vite necesita scripts inline para el hot reload.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' data: blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'",
].join('; ')

const securityHeaders = {
  name: 'flow-csp',
  apply: 'build',
  transformIndexHtml: (html) => html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
}

export default defineConfig({
  base: './',
  plugins: [react(), securityHeaders],
  server: { port: 5173, strictPort: true },
  test: { include: ['tests/**/*.test.js'], environment: 'node' },
})
