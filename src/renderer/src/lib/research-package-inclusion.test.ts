import { beforeEach, describe, expect, it, vi } from 'vitest'

import { usePackageOperationStore } from '@/stores/package-operation-store'
import { useSessionStore } from '@/stores/session-store'

import {
  addFileToResearchPackage,
  canAddFileToResearchPackage,
  type ResearchPackageTarget
} from './research-package-inclusion'
import { exportSessionPackage } from './session-package-export'

vi.mock('./session-package-export', () => ({ exportSessionPackage: vi.fn() }))

const target = (overrides: Partial<ResearchPackageTarget> = {}): ResearchPackageTarget => ({
  projectId: 'project-1',
  sessionId: 'session-1',
  fileId: 'artifact-1',
  filename: 'plot.png',
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

    await expect(addFileToResearchPackage(target())).resolves.toBe(true)

    expect(exportSessionPackage).toHaveBeenCalledTimes(1)
    expect(usePackageOperationStore.getState().preselect).toEqual({
      fileId: 'artifact-1',
      filename: 'plot.png'
    })
  })

  it('clears the request when the export never starts', async () => {
    vi.mocked(exportSessionPackage).mockResolvedValue(false)

    await expect(addFileToResearchPackage(target())).resolves.toBe(false)
    expect(usePackageOperationStore.getState().preselect).toBeNull()
  })

  it('clears the request when the export throws', async () => {
    vi.mocked(exportSessionPackage).mockRejectedValue(new Error('export failed'))

    await expect(addFileToResearchPackage(target())).rejects.toThrow('export failed')
    expect(usePackageOperationStore.getState().preselect).toBeNull()
  })

  it('does nothing for a file whose Session is not loaded', async () => {
    await expect(addFileToResearchPackage(target({ sessionId: 'missing-session' }))).resolves.toBe(
      false
    )
    expect(exportSessionPackage).not.toHaveBeenCalled()
    expect(usePackageOperationStore.getState().preselect).toBeNull()
  })

  it.each([
    ['a pending upload with no Session', { sessionId: undefined }],
    ['a local file with no managed identity', { fileId: undefined }],
    ['a file without a project', { projectId: undefined }]
  ])('refuses %s instead of offering the action', async (_label, overrides) => {
    const candidate = target(overrides)

    expect(canAddFileToResearchPackage(candidate)).toBe(false)
    await expect(addFileToResearchPackage(candidate)).resolves.toBe(false)
    expect(exportSessionPackage).not.toHaveBeenCalled()
    expect(usePackageOperationStore.getState().preselect).toBeNull()
  })

  it('reports that a file with an owning Session can be added', () => {
    expect(canAddFileToResearchPackage(target())).toBe(true)
  })
})
