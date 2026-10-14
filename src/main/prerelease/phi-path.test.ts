import { existsSync, readFileSync } from 'node:fs'

import { expect, it } from 'vitest'

// Offline beta mode does not add a second model client. Provider HTTP stays on this function,
// and the Japanese PHI gate wraps the body when that module is installed.
it('keeps provider requests on the PHI gate when that gate is present', () => {
  const source = readFileSync('src/main/settings/provider-fetch.ts', 'utf8')
  expect(source).toContain('export const fetchProviderRequest')
  expect(source).toContain('return fetchImpl')
  const gatePresent = existsSync('src/main/phi/gate.ts') || source.includes('guardProviderBody')
  if (gatePresent) {
    expect(source).toContain('guardProviderBody')
    expect(source.indexOf('guardProviderBody')).toBeLessThan(source.lastIndexOf('return fetchImpl'))
  }
})
