import { beforeEach, describe, expect, it } from 'vitest'

import type { PackageOperationSnapshot, PackageSelectableFile } from '../../../shared/session-package'
import { usePackageOperationStore } from './package-operation-store'

const selectableFile = (overrides: Partial<PackageSelectableFile> = {}): PackageSelectableFile => ({
  storageKey: 'artifacts/project-1/session-1/artifact-1/version-1/content',
  filename: 'plot.png',
  sizeBytes: 1024,
  groupId: 'artifact-1',
  versionId: 'artifact-version-1',
  source: 'artifact',
  versionNumber: 1,
  dependentFiles: [],
  ...overrides
})

const secondVersion = selectableFile({
  storageKey: 'artifacts/project-1/session-1/artifact-1/version-2/content',
  versionId: 'artifact-version-2',
  versionNumber: 2
})

const otherFile = selectableFile({
  storageKey: 'artifacts/project-1/session-1/artifact-2/version-1/content',
  groupId: 'artifact-2',
  versionId: 'artifact-version-3',
  filename: 'table.csv'
})

const awaitingSelection = (files: PackageSelectableFile[]): PackageOperationSnapshot => ({
  id: 'operation-1',
  kind: 'export',
  state: 'awaiting-selection',
  progress: { phase: 'selecting' },
  files
})

describe('package operation preselect', () => {
  beforeEach(() => {
    usePackageOperationStore.setState({
      operation: null,
      excludedStorageKeys: null,
      selectionPreset: 'compact',
      preselect: null,
      open: false
    })
  })

  // Version granularity is the point: a reader looking at v2 did not ask for v1..v5, and the selector
  // would look identical either way, so the extra Versions would ship without being noticed.
  it('checks only the requested Version and leaves its siblings excluded', () => {
    usePackageOperationStore.getState().preselectResearchPackageFile({
      fileId: 'artifact-1',
      versionId: 'artifact-version-2',
      filename: 'plot.png'
    })
    usePackageOperationStore
      .getState()
      .receive(awaitingSelection([selectableFile(), secondVersion, otherFile]))

    const state = usePackageOperationStore.getState()
    expect(state.excludedStorageKeys).not.toContain(secondVersion.storageKey)
    expect(state.excludedStorageKeys).toContain(selectableFile().storageKey)
    expect(state.excludedStorageKeys).toContain(otherFile.storageKey)
    expect(state.selectionPreset).toBe('custom')
    // One shot: a later snapshot must not re-apply the request.
    expect(state.preselect).toBeNull()
  })

  // A surface that knows only the file (no Version on screen) keeps the older, coarser behaviour.
  it('checks every Version when the request names no Version', () => {
    usePackageOperationStore.getState().preselectResearchPackageFile({
      fileId: 'artifact-1',
      filename: 'plot.png'
    })
    usePackageOperationStore
      .getState()
      .receive(awaitingSelection([selectableFile(), secondVersion, otherFile]))

    const state = usePackageOperationStore.getState()
    expect(state.excludedStorageKeys).not.toContain(selectableFile().storageKey)
    expect(state.excludedStorageKeys).not.toContain(secondVersion.storageKey)
    expect(state.excludedStorageKeys).toContain(otherFile.storageKey)
    expect(state.selectionPreset).toBe('custom')
  })

  it('keeps a manual change after the preselected snapshot arrives', () => {
    usePackageOperationStore.getState().preselectResearchPackageFile({
      fileId: 'artifact-1',
      versionId: 'artifact-version-1',
      filename: 'plot.png'
    })
    usePackageOperationStore.getState().receive(awaitingSelection([selectableFile()]))
    const first = usePackageOperationStore.getState()

    // The reader unchecks it by hand; the next snapshot of the same operation must honour that.
    usePackageOperationStore.setState({
      excludedStorageKeys: [...(first.excludedStorageKeys ?? []), selectableFile().storageKey]
    })
    usePackageOperationStore.getState().receive(awaitingSelection([selectableFile()]))

    expect(usePackageOperationStore.getState().excludedStorageKeys).toContain(
      selectableFile().storageKey
    )
  })

  it('lets a second request replace the first instead of pre-checking both', () => {
    usePackageOperationStore.getState().preselectResearchPackageFile({
      fileId: 'artifact-1',
      versionId: 'artifact-version-1',
      filename: 'plot.png'
    })
    usePackageOperationStore.getState().preselectResearchPackageFile({
      fileId: 'artifact-2',
      versionId: 'artifact-version-3',
      filename: 'table.csv'
    })
    usePackageOperationStore
      .getState()
      .receive(awaitingSelection([selectableFile(), otherFile]))

    const state = usePackageOperationStore.getState()
    expect(state.excludedStorageKeys).not.toContain(otherFile.storageKey)
    expect(state.excludedStorageKeys).toContain(selectableFile().storageKey)
  })

  it('drops an unconsumed request when the export ends without a selection', () => {
    usePackageOperationStore.getState().preselectResearchPackageFile({
      fileId: 'artifact-1',
      filename: 'plot.png'
    })
    usePackageOperationStore.getState().receive({
      id: 'operation-1',
      kind: 'export',
      state: 'cancelled',
      progress: { phase: 'cleaning' }
    })

    expect(usePackageOperationStore.getState().preselect).toBeNull()
  })

  // A selection that times out in the main process settles as a failure, not a cancellation, so the
  // request must not survive into the next export through that branch either.
  it('drops an unconsumed request when the export fails before showing the selector', () => {
    usePackageOperationStore.getState().preselectResearchPackageFile({
      fileId: 'artifact-1',
      filename: 'plot.png'
    })
    usePackageOperationStore.getState().receive({
      id: 'operation-1',
      kind: 'export',
      state: 'failed',
      progress: { phase: 'selecting' }
    })

    expect(usePackageOperationStore.getState().preselect).toBeNull()
  })
})
