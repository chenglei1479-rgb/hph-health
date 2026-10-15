import { englishNativeTranslator, type NativeTranslator } from '../locale/main-process-messages'
import {
  buildConfirmInstaller,
  parseConfirmDecision,
  type PhiConfirmDecision,
  type PhiConfirmer,
  type PhiPreview
} from '../phi/confirm'

const DISMISSED: PhiConfirmDecision = { confirmed: false }

// Reuses the shared de-identification review page. Closing the window exports nothing.
export const createStatisticianExportConfirmer = (
  translate: NativeTranslator = englishNativeTranslator
): PhiConfirmer => {
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
      title: translate('Review de-identified export'),
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    })
    const labels = {
      title: translate('Review de-identified export'),
      explanation: translate(
        'Highlighted patient information was removed from the statistician package. Confirm to export these files. Closing this window exports nothing.'
      ),
      confirm: translate('Confirm export'),
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
