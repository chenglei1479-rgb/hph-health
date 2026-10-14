import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { isSecureStorageAvailable, protectedSafeStorage } from '../secure-storage'
import { createMachineApprovalLog } from './approval'
import {
  createClosedGate,
  createVaultBackedGate,
  installMachineApproval,
  installPhiGate
} from './gate'
import { createEncryptedPhiVault } from './store'

// Installed from the Electron main process after app.whenReady. The vault directory is under
// userData, outside any research project directory, and is not part of package export.
const VAULT_UNAVAILABLE = 'PHI vault encryption is unavailable. Model requests are blocked.'

export function machineApprovalLogPath(directory: string): string {
  return join(directory, 'machine-approval.jsonl')
}

export function installProductionPhiGate(directory: string): void {
  try {
    mkdirSync(directory, { recursive: true })
    const approval = createMachineApprovalLog(machineApprovalLogPath(directory))
    installMachineApproval(() => approval.isApproved())
    if (!isSecureStorageAvailable()) {
      installPhiGate(createClosedGate(VAULT_UNAVAILABLE))
      return
    }
    const vault = createEncryptedPhiVault(directory, protectedSafeStorage)
    installPhiGate(createVaultBackedGate(vault))
  } catch {
    // A vault that cannot be created must not take the app down, and must not fall open.
    installMachineApproval(null)
    installPhiGate(createClosedGate(VAULT_UNAVAILABLE))
  }
}
