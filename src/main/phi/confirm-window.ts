import type { BrowserWindow as ElectronBrowserWindow } from 'electron'
import { englishNativeTranslator, type NativeTranslator } from '../locale/main-process-messages'
import {
  buildConfirmInstaller,
  phiConfirmLabels,
  parseConfirmDecision,
  type PhiConfirmDecision,
  type PhiConfirmLabels,
  type PhiConfirmer,
  type PhiPreview
} from './confirm'

const DISMISSED: PhiConfirmDecision = { confirmed: false }

// The same local review page serves in-process Electron and authenticated Node-backend requests.
// Preview labels are already translated by the backend's application locale owner.
export async function reviewPhiPreviewInElectron(
  preview: PhiPreview,
  labels: PhiConfirmLabels,
  options: { parent?: ElectronBrowserWindow; signal?: AbortSignal } = {}
): Promise<PhiConfirmDecision> {
  options.signal?.throwIfAborted()
  const { BrowserWindow } = await import('electron')
  const parent =
    options.parent ?? BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const win = new BrowserWindow({
    parent,
    modal: Boolean(parent),
    width: 760,
    height: 640,
    show: false,
    autoHideMenuBar: true,
    title: labels.title,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  return new Promise((resolve) => {
    let settled = false
    const abort = (): void => finish(DISMISSED)
    const finish = (decision: PhiConfirmDecision): void => {
      if (settled) return
      settled = true
      options.signal?.removeEventListener('abort', abort)
      resolve(decision)
      if (!win.isDestroyed()) win.close()
    }
    options.signal?.addEventListener('abort', abort, { once: true })
    if (options.signal?.aborted) {
      abort()
      return
    }
    win.webContents.on('console-message', (details, _level, message) => {
      const text = typeof message === 'string' && message.length > 0 ? message : details.message
      try {
        const decision = parseConfirmDecision(text)
        if (decision) finish(decision)
      } catch {
        finish(DISMISSED)
      }
    })
    win.on('closed', () => finish(DISMISSED))
    void win
      .loadURL('about:blank')
      .then(() => win.webContents.executeJavaScript(buildConfirmInstaller(preview, labels)))
      .then(() => {
        if (!win.isDestroyed()) win.show()
      })
      .catch(() => finish(DISMISSED))
  })
}

export function createElectronPhiConfirmer(
  translate: NativeTranslator = englishNativeTranslator
): PhiConfirmer {
  return (preview, signal) =>
    reviewPhiPreviewInElectron(preview, phiConfirmLabels(translate), { signal })
}
