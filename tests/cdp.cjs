// Cliente mínimo del protocolo de depuración de Chromium (CDP) para probar la app Electron real.
const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function launchApp({ port = 9333, root = path.join(__dirname, '..') } = {}) {
  const electron = require('electron')
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-e2e-'))
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  // FLOW_EXE permite probar la app empaquetada (p. ej. release/win-unpacked/Flow.exe) en vez del código fuente.
  const exe = process.env.FLOW_EXE
  const args = [`--remote-debugging-port=${port}`, `--user-data-dir=${userData}`]
  const child = exe ? spawn(exe, args, { env, stdio: 'ignore' }) : spawn(electron, [root, ...args], { cwd: root, env, stdio: 'ignore' })

  let target
  for (let i = 0; i < 60 && !target; i++) {
    await wait(500)
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
      target = list.find((t) => t.type === 'page' && t.url.startsWith('file:'))
    } catch {
      /* aún arrancando */
    }
  }
  if (!target) {
    child.kill()
    throw new Error('La app no arrancó (no apareció la página de depuración)')
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.onopen = res
    ws.onerror = rej
  })

  let id = 0
  const pending = new Map()
  const listeners = []
  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data)
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id)
      pending.delete(data.id)
      data.error ? reject(new Error(data.error.message)) : resolve(data.result)
    } else if (data.method) {
      listeners.forEach((fn) => fn(data.method, data.params))
    }
  }

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = ++id
      pending.set(n, { resolve, reject })
      ws.send(JSON.stringify({ id: n, method, params }))
    })

  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text)
    return res.result.value
  }

  const waitFor = async (expression, timeout = 6000) => {
    const end = Date.now() + timeout
    while (Date.now() < end) {
      try {
        if (await evaluate(expression)) return true
      } catch {
        /* reintenta */
      }
      await wait(100)
    }
    return false
  }

  const close = async () => {
    try {
      ws.close()
    } catch {
      /* ignora */
    }
    child.kill()
    await wait(500)
    try {
      fs.rmSync(userData, { recursive: true, force: true })
    } catch {
      /* ignora */
    }
  }

  return { send, evaluate, waitFor, close, onEvent: (fn) => listeners.push(fn), wait }
}

module.exports = { launchApp, wait }
