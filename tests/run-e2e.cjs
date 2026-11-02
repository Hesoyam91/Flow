// Compila y ejecuta las pruebas de extremo a extremo. Uso: npm run test:e2e
const { spawnSync } = require('child_process')
const path = require('path')

const root = path.join(__dirname, '..')
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE // si está activa, Electron arrancaría como Node y fallaría
const run = (cmd, args) => spawnSync(cmd, args, { cwd: root, env, stdio: 'inherit', shell: process.platform === 'win32' && cmd === 'npx' }).status

let code = run('npx', ['vite', 'build'])
if (code === 0) code = run(require('electron'), [path.join(__dirname, 'e2e-export.cjs')]) || 0
const exportCode = code
const appCode = run(process.execPath, [path.join(__dirname, 'e2e-app.cjs')])
process.exit(exportCode || appCode)
