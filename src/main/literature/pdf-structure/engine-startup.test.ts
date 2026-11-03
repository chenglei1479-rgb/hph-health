import { spawn } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'

vi.mock('node:child_process', () => ({ spawn: vi.fn() }))

describe('PDF structure startup import', () => {
  it('imports the host engine and the public worker-result reader', async () => {
    const engine = await import('./engine')
    const worker = await import('@aipoch/pdf-structure')

    expect(engine.createPdfStructureEngine).toBeTypeOf('function')
    expect(worker.readWorkerResult).toBeTypeOf('function')
  })

  it('constructs the host engine without starting a PDF worker', async () => {
    const { createPdfStructureEngine } = await import('./engine')
    const engine = createPdfStructureEngine()

    expect(engine.describe).toBeTypeOf('function')
    expect(engine.start).toBeTypeOf('function')
    expect(spawn).not.toHaveBeenCalled()
  })
})
