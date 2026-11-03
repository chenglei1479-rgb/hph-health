import { describe, expect, it, vi } from 'vitest'

const bindingError = vi.hoisted(() => new Error('Could not load the sharp native binding'))
vi.mock('sharp', () => {
  throw bindingError
})

describe('PDF structure with an unavailable native image binding', () => {
  it('imports the public entry and constructs an engine before loading sharp', async () => {
    const api = await import('../src/index.js')
    expect(api.readWorkerResult).toBeTypeOf('function')
    expect(() => api.createPdfStructureEngine({ modelRecipe: { revision: 'test' } })).not.toThrow()
  })

  it('rejects fingerprint requests with a readable failure and retains the native cause', async () => {
    const { createPdfStructureEngine } = await import('../src/index.js')
    const engine = createPdfStructureEngine({ modelRecipe: { revision: 'test' } })
    await expect(engine.describe()).rejects.toMatchObject({
      message: 'PDF image processing is unavailable.',
      cause: expect.any(Error)
    })
  })
})
