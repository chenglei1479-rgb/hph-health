import { beforeEach, describe, expect, it } from 'vitest'

import type { PackageOperationSnapshot, PackageSelectableFile } from '../../../shared/session-package'
import { usePackageOperationStore } from './package-operation-store'

const selectableFile = (overrides: Partial<PackageSelectableFile> = {}): PackageSelectableFile => ({
  storageKey: 'artifacts/project-1/session-1/artifact-1/version-1/content',
  filename: 'plot.png',
  sizeBytes: 1024,
  groupId: 'artifact-1',
  source: 'artifact',
  versionNumber: 1,
  dependentFiles: [],
  ...overrides
})

const awaitingSelection = (
  files: PackageSelectableFile[]
): PackageOperationSnapshot => ({
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

  it('checks the requested file and every one of its Versions, then forgets the request', () => {
    const versionOne = selectableFile()
    const versionTwo = selectableFile({
      storageKey: 'artifacts/project-1/session-1/artifact-1/version-2/content',
      versionNumber: 2
    })
    const other = selectableFile({
      storageKey: 'artifacts/project-1/session-1/artifact-2/version-1/content',
      groupId: 'artifact-2',
      filename: 'table.csv'
    })

    usePackageOperationStore.getState().preselectResearchPackageFile({
      fileId: 'artifact-1',
      filename: 'plot.png'
    })
    usePackageOperationStore.getState().receive(awaitingSelection([versionOne, versionTwo, other]))

    const state = usePackageOperationStore.getState()
    // The default Essential preset excludes every optional payload; both Versions of the requested
    // file are put back, and nothing else is.
    expect(state.excludedStorageKeys).not.toContain(versionOne.storageKey)
    expect(state.excludedStorageKeys).not.toContain(versionTwo.storageKey)
    expect(state.excludedStorageKeys).toContain(other.storageKey)
    expect(state.selectionPreset).toBe('custom')
    // One shot: a later snapshot must not re-apply the request.
    expect(state.preselect).toBeNull()
  })

  it('keeps a manual change after the preselected snapshot arrives', () => {
    usePackageOperationStore.getState().preselectResearchPackageFile({
      fileId: 'artifact-1',
      filename: 'plot.png'
    })
    usePackageOperationStore.getState().receive(awaitingSelection([selectableFile()]))
    const first = usePackageOperationStore.getState()

    // The reader unchecks it by hand; the next snapshot of the same operation must honour that.
    usePackageOperationStore.setState({
      excludedStorageKeys: [
        ...(first.excludedStorageKeys ?? []),
        selectableFile().storageKey
      ]
    })
    usePackageOperationStore.getState().receive(awaitingSelection([selectableFile()]))

    expect(usePackageOperationStore.getState().excludedStorageKeys).toContain(
      selectableFile().storageKey
    )
  })

  it('lets a second request replace the first instead of pre-checking both', () => {
    usePackageOperationStore.getState().preselectResearchPackageFile({
      fileId: 'artifact-1',
      filename: 'plot.png'
    })
    usePackageOperationStore.getState().preselectResearchPackageFile({
      fileId: 'artifact-2',
      filename: 'table.csv'
    })

    const requested = selectableFile()
    const other = selectableFile({
      storageKey: 'artifacts/project-1/session-1/artifact-2/version-1/content',
      groupId: 'artifact-2',
      filename: 'table.csv'
    })
    usePackageOperationStore.getState().receive(awaitingSelection([requested, other]))

    const state = usePackageOperationStore.getState()
    expect(state.excludedStorageKeys).not.toContain(other.storageKey)
    expect(state.excludedStorageKeys).toContain(requested.storageKey)
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
})
