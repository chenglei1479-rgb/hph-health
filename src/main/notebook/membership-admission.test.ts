import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it, vi } from 'vitest'
import { NotebookRuntimeService } from './runtime-service'
it('rejects paid execution through core entry points before admitting work or starting kernels', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dra-membership-admission-'))
  const authorizeExecution = vi.fn((mode: 'foreground' | 'background') => {
    expect(['foreground', 'background']).toContain(mode)
    throw new Error('MEMBERSHIP_BLOCKED')
  })
  const runtime = new NotebookRuntimeService({
    configRoot: root,
    dataRoot: root,
    projectId: 'project-1',
    authorizeExecution
  })
  try {
    const request = {
      projectId: 'project-1',
      sessionId: 'session-1',
      workspaceCwd: root,
      code: 'print(1)'
    }
    await expect(runtime.execute(request)).rejects.toThrow('MEMBERSHIP_BLOCKED')
    await expect(runtime.runCell({ ...request, cellId: 'cell-1' })).rejects.toThrow(
      'MEMBERSHIP_BLOCKED'
    )
    await expect(runtime.executeBackground(request)).rejects.toThrow('MEMBERSHIP_BLOCKED')
    await expect(runtime.executeControlBackground({ ...request, code: '1+1' })).rejects.toThrow(
      'MEMBERSHIP_BLOCKED'
    )
    await expect(
      runtime.executeShellBackground({ ...request, command: 'echo test' })
    ).rejects.toThrow('MEMBERSHIP_BLOCKED')
    expect(authorizeExecution.mock.calls.map(([mode]) => mode)).toEqual([
      'foreground',
      'foreground',
      'background',
      'background',
      'background'
    ])
  } finally {
    await runtime.dispose()
    rmSync(root, { recursive: true, force: true })
  }
})
