import { beforeEach, describe, expect, it, vi } from 'vitest'

import { usePackageOperationStore } from '@/stores/package-operation-store'
import { useSessionStore } from '@/stores/session-store'
import type { ProjectFileItem } from '../../../shared/project-files'

import { addFileToResearchPackage } from './research-package-inclusion'
import { exportSessionPackage } from './session-package-export'

vi.mock('./session-package-export', () => ({ exportSessionPackage: vi.fn() }))

const projectFile = (overrides: Partial<ProjectFileItem> = {}): ProjectFileItem => ({
  id: 'file-1',
  source: 'artifact',
  sourceFileId: 'artifact-1',
  sourceVersionId: 'version-1',
  projectId: 'project-1',
  sessionId: 'session-1',
  name: 'plot.png',
  path: '/managed/plot.png',
  size: 1024,
  sortAtMs: 0,
  ...overrides
})

describe('addFileToResearchPackage', () => {
  beforeEach(() => {
    vi.mocked(exportSessionPackage).mockReset()
    usePackageOperationStore.setState({ operation: null, preselect: null })
    useSessionStore.setState({
      sessions: [{ id: 'session-1', projectId: 'project-1' }] as never
    })
  })

  it('opens the export selector with that file preselected', async () => {
    vi.mocked(exportSessionPackage).mockResolvedValue(true)

    await expect(addFileToResearchPackage(projectFile())).resolves.toBe(true)

    expect(exportSessionPackage).toHaveBeenCalledTimes(1)
    expect(usePackageOperationStore.getState().preselect).toEqual({
      fileId: 'artifact-1',
      filename: 'plot.png'
    })
  })

  it('clears the request when the export never starts', async () => {
    vi.mocked(exportSessionPackage).mockResolvedValue(false)

    await expect(addFileToResearchPackage(projectFile())).resolves.toBe(false)
    expect(usePackageOperationStore.getState().preselect).toBeNull()
  })

  it('clears the request when the export throws', async () => {
    vi.mocked(exportSessionPackage).mockRejectedValue(new Error('export failed'))

    await expect(addFileToResearchPackage(projectFile())).rejects.toThrow('export failed')
    expect(usePackageOperationStore.getState().preselect).toBeNull()
  })

  it('does nothing for a file whose Session is not loaded', async () => {
    await expect(
      addFileToResearchPackage(projectFile({ sessionId: 'missing-session' }))
    ).resolves.toBe(false)
    expect(exportSessionPackage).not.toHaveBeenCalled()
    expect(usePackageOperationStore.getState().preselect).toBeNull()
  })
})
