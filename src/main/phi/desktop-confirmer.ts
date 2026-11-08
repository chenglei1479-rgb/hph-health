import { createLogger } from '@aipoch/diagnostics/node'

import { desktopFileInteraction } from '../desktop-interaction'
import type { NativeTranslator } from '../locale/main-process-messages'
import { PHI_REVIEW_UNAVAILABLE_CODE } from '../../shared/phi-block'
import type { PhiConfirmer } from './confirm'
import { phiConfirmLabels } from './confirm'
import { phiReviewUnavailableError } from './gate'

const diagnostics = createLogger('phi')

/** Uses the existing authenticated native bridge, never an Electron import in the backend. */
export function createDesktopPhiConfirmer(translate: NativeTranslator): PhiConfirmer {
  return async (preview, signal) => {
    const interaction = desktopFileInteraction()
    if (!interaction.reviewPhi) {
      // #195: this is a wiring gap, not a content refusal and not a human decision. It stays retryable
      // (C1) so a later install of the review surface recovers, but it must be countable here: an
      // assembly bug that only shows up as retries is invisible.
      diagnostics.warn('phi review surface unavailable', {
        code: PHI_REVIEW_UNAVAILABLE_CODE,
        reason: 'bridge-has-no-review-surface'
      })
      throw phiReviewUnavailableError()
    }
    return interaction.reviewPhi(preview, phiConfirmLabels(translate), undefined, signal)
  }
}
