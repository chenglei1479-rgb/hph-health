import { desktopFileInteraction } from '../desktop-interaction'
import type { NativeTranslator } from '../locale/main-process-messages'
import type { PhiConfirmer } from './confirm'
import { phiConfirmLabels } from './confirm'
import { modelReleaseError } from './gate'

/** Uses the existing authenticated native bridge, never an Electron import in the backend. */
export function createDesktopPhiConfirmer(translate: NativeTranslator): PhiConfirmer {
  return async (preview, signal) => {
    const interaction = desktopFileInteraction()
    if (!interaction.reviewPhi) throw modelReleaseError()
    return interaction.reviewPhi(preview, phiConfirmLabels(translate), undefined, signal)
  }
}
