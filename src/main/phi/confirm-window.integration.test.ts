// #160 requires keyboard reachability to be checked in a real window, not jsdom: the review page is a
// separate Electron BrowserWindow whose layout decides whether the buttons stay reachable while the
// request scrolls. This spawns the real Electron binary, loads the page built by buildConfirmInstaller,
// and drives it with webContents.sendInputEvent.
//
// #207: the first CI run of this case failed with `expected 291 to be greater than 291`. The geometry
// assertion assumed the visible content overflows the scroll region, but the full request sits in a
// closed <details>, so the visible content is short and the assertion was measuring a page that does not
// scroll. The case now opens the detail first (the state a doctor reaches when they inspect the request)
// and asserts overflow as a precondition of the geometry, while the layout contract that does not depend
// on overflow (footer outside the scroll region) is asserted separately.
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

// The window is the one the real confirmer opens; its size is production's, not this test's business.
// What the test controls is the state: the full request is opened, so <main> has to scroll.
const WINDOW_WIDTH = 760
const WINDOW_HEIGHT = 480

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
const geometry = "(() => { const f = document.querySelector('footer').getBoundingClientRect(); return { top: f.top, bottom: f.bottom, height: f.height, viewport: innerHeight } })()"
const structure = "(() => { const main = document.querySelector('main'); const footer = document.querySelector('footer'); return { footerInScrollRegion: footer.closest('main') !== null, footerParent: footer.parentElement ? footer.parentElement.tagName : '', mainOverflowY: getComputedStyle(main).overflowY } })()"
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: ${WINDOW_WIDTH},
    height: ${WINDOW_HEIGHT},
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
    result.detailsOpen = await win.webContents.executeJavaScript("document.querySelector('details').open")
    // The layout contract, asserted before anything scrolls: the footer lives outside the scroll
    // region, so it cannot be pushed away no matter how tall the content gets.
    result.structure = await win.webContents.executeJavaScript(structure)
    // Open the complete request, which is the state the footer must survive.
    await win.webContents.executeJavaScript("document.querySelector('details').open = true")
    await wait(60)
    result.scrollHeight = await win.webContents.executeJavaScript("document.querySelector('main').scrollHeight")
    result.clientHeight = await win.webContents.executeJavaScript("document.querySelector('main').clientHeight")
    await win.webContents.executeJavaScript("document.querySelector('main').scrollTop = document.querySelector('main').scrollHeight")
    await wait(120)
    result.footerAfterScroll = await win.webContents.executeJavaScript(geometry)
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

const runWindow = async (flags: readonly string[]): Promise<Record<string, unknown>> => {
  const root = mkdtempSync(join(tmpdir(), 'confirm-window-'))
  try {
    const preview: PhiPreview = {
      // The complete request is what the detail shows; it is long enough to need scrolling in the real
      // window once opened.
      text: `{"model":"gpt-5","instructions":"${'application instructions. '.repeat(200)}","input":[{"text":"PubMed で「再入院」を検索してください。[日付1]"}]}`,
      highlights: (
        [
          { start: 5000, end: 5005, category: 'DATE' },
          { start: 5006, end: 5011, category: 'PERSON_NAME' }
        ] as const
      ).map((mark) => ({
        ...mark,
        start: Math.min(mark.start, 100),
        end: Math.min(mark.end, 105)
      })),
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
    const child = spawn(electronBinary, [...flags, script], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    })
    let stderr = ''
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`electron timed out; stderr: ${stderr}`)),
        120_000
      )
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

// A host that can create a Chromium window must pass this gate. The default argument list is tried
// first, then the software-rendering sets a machine without a usable GPU needs; the first set that
// produces a window is used for the real run. Every attempt is recorded so a skipped run says which
// flag sets were measured rather than reading as "nobody can verify this".
const WINDOW_FLAG_SETS: ReadonlyArray<readonly string[]> = [
  [],
  ['--disable-gpu'],
  ['--disable-gpu', '--no-sandbox'],
  ['--use-gl=swiftshader'],
  ['--disable-gpu', '--use-gl=swiftshader'],
  ['--use-gl=angle', '--use-angle=swiftshader']
]

const probeWindow = (flags: readonly string[]): { ok: boolean; detail: string } => {
  const root = mkdtempSync(join(tmpdir(), 'confirm-window-probe-'))
  try {
    const probe = join(root, 'probe.cjs')
    writeFileSync(
      probe,
      `const { app, BrowserWindow } = require('electron')\n` +
        `const fs = require('node:fs')\n` +
        `app.whenReady().then(async () => {\n` +
        `  const win = new BrowserWindow({ show: false, width: 400, height: 300 })\n` +
        `  await win.loadURL('data:text/html,<body><div id="x">ok</div></body>')\n` +
        `  const value = await win.webContents.executeJavaScript('document.getElementById("x").textContent')\n` +
        `  fs.writeFileSync(process.env.PROBE_OUT, value === 'ok' ? 'window' : 'unexpected')\n` +
        `  app.quit()\n` +
        `}).catch((error) => { fs.writeFileSync(process.env.PROBE_OUT, 'error'); app.exit(1) })\n`,
      'utf8'
    )
    const env: NodeJS.ProcessEnv = { ...process.env, PROBE_OUT: join(root, 'probe-out.txt') }
    delete env.ELECTRON_RUN_AS_NODE
    const result = spawnSync(electronBinary, [...flags, probe], {
      env,
      timeout: 60_000,
      encoding: 'utf8'
    })
    const wrote = existsSync(env.PROBE_OUT!) ? readFileSync(env.PROBE_OUT!, 'utf8') : ''
    return {
      ok: wrote === 'window',
      detail: `[${flags.length === 0 ? 'defaults' : flags.join(' ')}] status ${result.status} wrote "${wrote}"`
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

const findWindowFlags = (): readonly string[] | undefined => {
  const attempts: string[] = []
  for (const flags of WINDOW_FLAG_SETS) {
    const attempt = probeWindow(flags)
    attempts.push(attempt.detail)
    if (attempt.ok) return flags
  }
  // This host cannot create a Chromium window; CI's Windows runner can, and that is where this case is
  // verified. The measured attempts are printed so a local skip is never read as a passing check.
  console.warn(
    `[#160] real Electron window unavailable on this host, so the keyboard and footer layout check runs only in CI. Attempts: ${attempts.join('; ')}`
  )
  return undefined
}

const windowFlags = findWindowFlags()

describe.skipIf(windowFlags === undefined)(
  'protected execution review window (real Electron window)',
  () => {
    it('keeps the buttons on screen while the opened request scrolls, and cancels with Escape', async () => {
      const result = await runWindow(windowFlags ?? [])
      expect(result.error).toBeUndefined()

      // Structure, independent of overflow: the footer is a flex sibling of the scroll region, so no
      // amount of content can push it out of the viewport.
      expect(result.structure).toEqual({
        footerInScrollRegion: false,
        footerParent: 'BODY',
        mainOverflowY: 'auto'
      })
      // The complete request is behind a closed detail when the window opens.
      expect(result.detailsOpen).toBe(false)

      // Precondition for the geometry below: the page really is in a scrolling state. The detail is
      // opened above; if this ever stops being true, the geometry assertion is meaningless and must
      // fail rather than pass on a page that does not scroll.
      expect(
        Number(result.scrollHeight),
        `main did not overflow (scrollHeight ${result.scrollHeight} vs clientHeight ${result.clientHeight})`
      ).toBeGreaterThan(Number(result.clientHeight))

      // Geometry after scrolling to the end: the footer is inside the viewport before and after.
      const footer = result.footerAfterScroll as {
        top: number
        bottom: number
        height: number
        viewport: number
      }
      expect(footer.height).toBeGreaterThan(0)
      expect(footer.top).toBeGreaterThanOrEqual(-1)
      expect(
        footer.bottom,
        `footer bottom ${footer.bottom} is below the viewport ${footer.viewport} after scrolling`
      ).toBeLessThanOrEqual(footer.viewport + 1)

      // Keyboard: the safe action owns the initial focus, Tab reaches the next button, Escape cancels.
      expect(result.initialFocus).toBe('cancel')
      expect(result.focusAfterTab).toBe('confirm')
      expect((result.messages as string[]).join('\n')).toContain('"confirmed":false')
    }, 120_000)
  }
)
