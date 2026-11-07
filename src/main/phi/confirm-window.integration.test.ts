// #160 requires keyboard reachability to be checked in a real window, not jsdom: the review page is a
// separate Electron BrowserWindow whose layout decides whether the buttons stay reachable while the
// request scrolls. This spawns the real Electron binary, loads the page built by buildConfirmInstaller,
// and drives it with webContents.sendInputEvent.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { buildConfirmInstaller, type PhiConfirmLabels, type PhiPreview } from './confirm'

const requireFromRoot = createRequire(import.meta.url)
const electronBinary = requireFromRoot('electron') as unknown as string

const labels: PhiConfirmLabels = {
  title: 'Review de-identified text',
  explanation: 'Highlighted text was replaced before sending. Confirm to send.',
  confirm: 'Confirm send',
  cancel: 'Cancel',
  mark: 'Mark selection',
  details: 'Show the request being sent',
  applicationNote: 'Text replaced inside the application instructions was handled automatically.'
}

const mainScript = `
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const file = process.env.CONFIRM_PAGE
const out = process.env.CONFIRM_RESULT
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const key = (win, keyCode) => {
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode })
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode })
}
const footerVisible = "(() => { const f = document.querySelector('footer').getBoundingClientRect(); return f.top >= -1 && f.bottom <= innerHeight + 1 && f.height > 0 })()"
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 760,
    height: 480,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  const messages = []
  win.webContents.on('console-message', (details, _level, message) => {
    messages.push(typeof message === 'string' && message.length > 0 ? message : details.message)
  })
  const result = {}
  try {
    await win.loadFile(file)
    result.initialFocus = await win.webContents.executeJavaScript('document.activeElement && document.activeElement.id')
    result.footerBeforeScroll = await win.webContents.executeJavaScript(footerVisible)
    result.scrollHeight = await win.webContents.executeJavaScript("document.querySelector('main').scrollHeight")
    result.clientHeight = await win.webContents.executeJavaScript("document.querySelector('main').clientHeight")
    await win.webContents.executeJavaScript("document.querySelector('main').scrollTop = 100000")
    await wait(120)
    result.footerAfterScroll = await win.webContents.executeJavaScript(footerVisible)
    result.detailsOpen = await win.webContents.executeJavaScript("document.querySelector('details').open")
    key(win, 'Tab')
    await wait(120)
    result.focusAfterTab = await win.webContents.executeJavaScript('document.activeElement && document.activeElement.id')
    key(win, 'Escape')
    await wait(200)
    result.messages = messages
  } catch (error) {
    result.error = String(error && error.stack ? error.stack : error)
  }
  fs.writeFileSync(out, JSON.stringify(result))
  app.quit()
})
`

const runWindow = async (): Promise<Record<string, unknown>> => {
  const root = mkdtempSync(join(tmpdir(), 'confirm-window-'))
  try {
    const preview: PhiPreview = {
      // Long enough that the full request has to scroll inside <main>.
      text: `{"model":"gpt-5","instructions":"${'application instructions. '.repeat(200)}","input":[{"text":"PubMed で「再入院」を検索してください。[日付1]"}]}`,
      highlights: [
        { start: 5000, end: 5005, category: 'DATE' },
        { start: 5006, end: 5011, category: 'PERSON_NAME' }
      ].map((mark) => ({ ...mark, start: Math.min(mark.start, 100), end: Math.min(mark.end, 105) })),
      applicationReplacements: 2
    }
    const page = join(root, 'confirm.html')
    writeFileSync(
      page,
      `<!doctype html><html><head><meta charset="utf-8"></head><body><script>${buildConfirmInstaller(preview, labels)}</script></body></html>`,
      'utf8'
    )
    const script = join(root, 'main.cjs')
    writeFileSync(script, mainScript, 'utf8')
    const out = join(root, 'result.json')
    // The harness exports ELECTRON_RUN_AS_NODE=1, which makes Electron run as plain Node; the page needs a
    // real renderer, so the child must not inherit it.
    const env: NodeJS.ProcessEnv = { ...process.env, CONFIRM_PAGE: page, CONFIRM_RESULT: out }
    delete env.ELECTRON_RUN_AS_NODE
    const child = spawn(electronBinary, [script], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    })
    let stderr = ''
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`electron timed out; stderr: ${stderr}`)), 60_000)
      child.on('exit', () => {
        clearTimeout(timer)
        resolve()
      })
      child.on('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
    })
    return JSON.parse(readFileSync(out, 'utf8')) as Record<string, unknown>
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

// This session cannot create a Chromium window (Electron exits with 0xC0000005 before the first paint),
// so the gate is measured rather than assumed: a minimal window probe decides whether the case runs. A
// host that can create windows must pass it; the probe result is printed so a skipped run is never read as
// a passing accessibility check.
const canCreateElectronWindow = (): boolean => {
  const root = mkdtempSync(join(tmpdir(), 'electron-window-probe-'))
  try {
    const probe = join(root, 'probe.cjs')
    writeFileSync(
      probe,
      `const { app, BrowserWindow } = require('electron')\n` +
        `const fs = require('node:fs')\n` +
        `app.disableHardwareAcceleration()\n` +
        `app.whenReady().then(async () => {\n` +
        `  const win = new BrowserWindow({ show: false, width: 320, height: 240 })\n` +
        `  await win.loadURL('data:text/html,<title>probe</title>')\n` +
        `  fs.writeFileSync(process.env.PROBE_OUT, 'window')\n` +
        `  app.quit()\n` +
        `}).catch(() => { fs.writeFileSync(process.env.PROBE_OUT, 'error'); app.exit(1) })\n`,
      'utf8'
    )
    const env: NodeJS.ProcessEnv = { ...process.env, PROBE_OUT: join(root, 'probe-out.txt') }
    delete env.ELECTRON_RUN_AS_NODE
    const result = spawnSync(electronBinary, ['--no-sandbox', '--disable-gpu', probe], {
      env,
      timeout: 60_000,
      encoding: 'utf8'
    })
    const wrote = existsSync(env.PROBE_OUT) ? readFileSync(env.PROBE_OUT, 'utf8') : ''
    if (wrote === 'window') return true
    console.warn(
      `[#160] real Electron window probe unavailable here (status ${result.status}); the keyboard check runs only on hosts that can create one`
    )
    return false
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

const electronWindowsAvailable = canCreateElectronWindow()

describe.skipIf(!electronWindowsAvailable)('protected execution review window (real Electron window)', () => {
  it('keeps the buttons on screen, opens on the safe action and cancels with Escape', async () => {
    const result = await runWindow()
    expect(result.error).toBeUndefined()
    // The full request is behind a closed detail and scrolls inside <main>.
    expect(result.detailsOpen).toBe(false)
    expect(Number(result.scrollHeight)).toBeGreaterThan(Number(result.clientHeight))
    // The footer stays inside the viewport before and after scrolling to the end.
    expect(result.footerBeforeScroll).toBe(true)
    expect(result.footerAfterScroll).toBe(true)
    // Keyboard: the safe action owns the initial focus, Tab reaches the next button, Escape cancels.
    expect(result.initialFocus).toBe('cancel')
    expect(result.focusAfterTab).toBe('confirm')
    expect((result.messages as string[]).join('\n')).toContain('"confirmed":false')
  }, 120_000)
})
