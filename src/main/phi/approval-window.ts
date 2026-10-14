import { englishNativeTranslator, type NativeTranslator } from '../locale/main-process-messages'
import {
  approvalLabels,
  buildApprovalInstaller,
  createMachineApprovalLog,
  parseApprovalDecision,
  type MachineApprovalDecision
} from './approval'

const DECLINED: MachineApprovalDecision = { approved: false, approvalNumber: '' }

export type MachineApprovalPrompter = () => Promise<MachineApprovalDecision>

// Asks once, the first time this machine has no declaration. Dismissing the window records
// not approved. An approval without a number is stored as not approved.
export async function ensureMachineApprovalDeclaration(
  filePath: string,
  translate: NativeTranslator = englishNativeTranslator,
  ask?: MachineApprovalPrompter
): Promise<void> {
  const log = createMachineApprovalLog(filePath)
  try {
    if (log.read().length > 0) return
  } catch {
    return
  }
  let decision = DECLINED
  try {
    decision = await (ask ?? createElectronMachineApprovalPrompter(translate))()
  } catch {
    decision = DECLINED
  }
  log.append({ approved: decision.approved, approvalNumber: decision.approvalNumber })
}

export function createElectronMachineApprovalPrompter(
  translate: NativeTranslator = englishNativeTranslator
): MachineApprovalPrompter {
  return async (): Promise<MachineApprovalDecision> => {
    const { BrowserWindow } = await import('electron')
    const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const labels = approvalLabels(translate)
    const win = new BrowserWindow({
      parent,
      modal: Boolean(parent),
      width: 560,
      height: 320,
      show: false,
      autoHideMenuBar: true,
      title: labels.title,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    })
    return new Promise((resolve) => {
      let settled = false
      const finish = (decision: MachineApprovalDecision): void => {
        if (settled) return
        settled = true
        resolve(decision)
        if (!win.isDestroyed()) win.close()
      }
      win.webContents.on('console-message', (_details, _level, message) => {
        try {
          const decision = parseApprovalDecision(message)
          if (decision) finish(decision)
        } catch {
          finish(DECLINED)
        }
      })
      win.on('closed', () => finish(DECLINED))
      void win
        .loadURL('about:blank')
        .then(() => win.webContents.executeJavaScript(buildApprovalInstaller(labels)))
        .then(() => {
          if (!win.isDestroyed()) win.show()
        })
        .catch(() => finish(DECLINED))
    })
  }
}
