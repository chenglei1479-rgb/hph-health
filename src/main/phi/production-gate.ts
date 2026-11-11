import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { createLogger } from '@aipoch/diagnostics/node'

import { isSecureStorageAvailable, protectedSafeStorage } from '../secure-storage'
import { createMachineApprovalLog } from './approval'
import {
  createClosedGate,
  createVaultBackedGate,
  installMachineApproval,
  installPhiGate,
  releaseFailureDiagnosticFields
} from './gate'
import { createEncryptedPhiVault } from './store'

// Installed from the Electron main process after app.whenReady. The vault directory is under
// userData, outside any research project directory, and is not part of package export.
const VAULT_UNAVAILABLE = 'PHI vault encryption is unavailable. Model requests are blocked.'
const gateLog = createLogger('phi')

export function machineApprovalLogPath(directory: string): string {
  return join(directory, 'machine-approval.jsonl')
}

export function installProductionPhiGate(directory: string): void {
  try {
    mkdirSync(directory, { recursive: true })
    const approval = createMachineApprovalLog(machineApprovalLogPath(directory))
    installMachineApproval(() => approval.isApproved())
    if (!isSecureStorageAvailable()) {
      // beta.23: a closed gate turns every turn into 503; say why once at construction instead of only
      // repeating "gate-error" at release time.
      gateLog.warn('phi gate closed', { reason: 'secure-storage-unavailable' })
      installPhiGate(createClosedGate(VAULT_UNAVAILABLE))
      return
    }
    const vault = createEncryptedPhiVault(directory, protectedSafeStorage)
    installPhiGate(createVaultBackedGate(vault))
  } catch (error) {
    // A vault that cannot be created must not take the app down, and must not fall open. The cause is
    // logged with stable identifiers only (no path, no message): the release path would otherwise
    // report every turn as an unexplained PHI-UNAVAILABLE-01.
    gateLog.warn('phi gate unavailable', {
      reason: 'gate-construction',
      ...releaseFailureDiagnosticFields(error)
    })
    installMachineApproval(null)
    installPhiGate(createClosedGate(VAULT_UNAVAILABLE))
  }
}
