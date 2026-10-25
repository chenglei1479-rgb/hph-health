import { desktopFileInteraction } from '../desktop-interaction'
import { englishNativeTranslator, type NativeTranslator } from '../locale/main-process-messages'
import type { PhiConfirmDecision, PhiConfirmLabels, PhiConfirmer } from '../phi/confirm'

// The statistician export runs in whichever process owns the application command: the Electron main
// process in the desktop app and the ordinary Node backend in a packaged or headless install. A
// BrowserWindow constructor is therefore never available here. The review travels over the same
// cross-process bridge as the model-send gate (phi/desktop-confirmer.ts): `phi-review` reaches
// desktop-native-electron.ts and lands in reviewPhiPreviewInElectron, which owns the window.
const statisticianExportLabels = (translate: NativeTranslator): PhiConfirmLabels => ({
  title: translate('Review de-identified export'),
  explanation: translate(
    'Highlighted patient information was removed from the statistician package. Confirm to export these files. Closing this window exports nothing.'
  ),
  confirm: translate('Confirm export'),
  cancel: translate('Cancel'),
  mark: translate('Mark selection')
})

// A missing bridge must not look like the doctor cancelling. The export owner maps every throw to
// `not-confirmed`, so the message and the log below are what distinguish the two in a bug report.
export class StatisticianConfirmUnavailableError extends Error {
  constructor() {
    super(
      'Statistician export confirmation requires the desktop privacy review bridge. No export was written.'
    )
    this.name = 'StatisticianConfirmUnavailableError'
  }
}

export const createStatisticianExportConfirmer = (
  translate: NativeTranslator = englishNativeTranslator
): PhiConfirmer => {
  return async (preview, signal): Promise<PhiConfirmDecision> => {
    const interaction = desktopFileInteraction()
    if (!interaction.reviewPhi) throw new StatisticianConfirmUnavailableError()
    return interaction.reviewPhi(preview, statisticianExportLabels(translate), undefined, signal)
  }
}
