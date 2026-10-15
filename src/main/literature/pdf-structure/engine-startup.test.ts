import { describe, expect, it, vi } from 'vitest'

// sharp's native binding throws while the module is being evaluated when the packaged
// library cannot be opened. That happens for win32-x64 and for both darwin-arm64 and
// darwin-x64 (quarantine or an ad-hoc signature). The engine must still import.
vi.mock('sharp', () => {
  throw new Error(
    'Could not load the sharp module using the win32-x64/darwin-arm64/darwin-x64 runtime'
  )
})

describe('PDF structure startup import', () => {
  it('imports the engine and worker without loading sharp', async () => {
    const engine = await import('./engine')
    const worker = await import('./worker-result')

    expect(engine.createPdfStructureEngine).toBeTypeOf('function')
    expect(worker.readWorkerResult).toBeTypeOf('function')
  })

  it('reports the native binding failure when a fingerprint is requested', async () => {
    const { createPdfStructureEngine } = await import('./engine')

    try {
      await createPdfStructureEngine('/resources').describe()
      expect.fail('fingerprint should fail when sharp cannot load')
    } catch (error) {
      const cause = error instanceof Error ? error.cause : undefined
      const text = [
        error instanceof Error ? error.message : String(error),
        cause instanceof Error ? cause.message : ''
      ].join('\n')
      expect(text).toMatch(/win32-x64\/darwin-arm64\/darwin-x64/)
    }
  })
})
