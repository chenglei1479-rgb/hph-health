import { englishNativeTranslator, type NativeTranslator } from '../locale/main-process-messages'
import {
  buildConfirmInstaller,
  parseConfirmDecision,
  type PhiConfirmDecision,
  type PhiConfirmer,
  type PhiPreview
} from './confirm'

const DISMISSED: PhiConfirmDecision = { confirmed: false }

// Opens a modal review of the de-identified text. Closing the window, or cancel, dismisses the
// send. The page reports the decision with a console message because the blank document has no
// preload bridge.
export function createElectronPhiConfirmer(
  translate: NativeTranslator = englishNativeTranslator
): PhiConfirmer {
  return async (preview: PhiPreview): Promise<PhiConfirmDecision> => {
    const { BrowserWindow } = await import('electron')
    const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const win = new BrowserWindow({
      parent,
      modal: Boolean(parent),
      width: 760,
      height: 640,
      show: false,
      autoHideMenuBar: true,
      title: translate('Review de-identified text'),
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    })
    const labels = {
      title: translate('Review de-identified text'),
      explanation: translate(
        'Highlighted text was replaced before sending. Select any other patient information and mark it. Confirm to send. Closing this window sends nothing.'
      ),
      confirm: translate('Confirm send'),
      cancel: translate('Cancel'),
      mark: translate('Mark selection')
    }
    return new Promise((resolve) => {
      let settled = false
      const finish = (decision: PhiConfirmDecision): void => {
        if (settled) return
        settled = true
        resolve(decision)
        if (!win.isDestroyed()) win.close()
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
}
