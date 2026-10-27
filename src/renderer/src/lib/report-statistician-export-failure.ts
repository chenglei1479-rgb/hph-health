import { projectRendererFailure } from '../renderer-diagnostics'

// The export runs in the renderer, where no general log channel exists. This module records one
// content-free failure report per failing stage through the existing renderer-diagnostics bridge, so
// main.log names the stage (context) and the error kind (category) without relaying any message text.
export type StatisticianExportStage = 'package' | 'build' | 'save'

const contextForStage = {
  package: 'statistician-export-package',
  build: 'statistician-export-build',
  save: 'statistician-export-save'
} as const

export const reportStatisticianExportFailure = (
  stage: StatisticianExportStage,
  error: unknown
): void => {
  try {
    // The bridge is Electron-only; the Web surface and test hosts simply have no diagnostics root.
    window.api?.diagnostics?.reportRendererFailure?.(
      projectRendererFailure('handled-error', error, 'home', contextForStage[stage])
    )
  } catch {
    // Reporting must never replace the failure it observes.
  }
}
