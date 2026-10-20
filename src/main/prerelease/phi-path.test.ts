import { existsSync, readFileSync } from 'node:fs'

import { expect, it } from 'vitest'

// Offline beta mode does not add a second model client. Provider HTTP stays on this function,
// and the Japanese PHI gate wraps the body when that module is installed.
it('keeps provider requests on the PHI gate when that gate is present', () => {
  const source = readFileSync('src/main/settings/provider-fetch.ts', 'utf8')
  expect(source).toContain('export const fetchProviderRequest')
  expect(source).toContain('return fetchImpl')
  const gatePresent = existsSync('src/main/phi/gate.ts') || source.includes('sendPhiChecked')
  if (gatePresent) {
    expect(source).toContain('sendPhiChecked')
    expect(source.indexOf('sendPhiChecked')).toBeLessThan(source.lastIndexOf('return fetchImpl'))
    const gate = readFileSync('src/main/phi/gate.ts', 'utf8')
    expect(gate).toContain('await guardProviderBodyImpl(body, projectId, tokens)')
  }
})
