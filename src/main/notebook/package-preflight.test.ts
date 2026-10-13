import { describe, expect, it } from 'vitest'
import { packagePreflight } from './package-preflight'

describe('analysis package preflight', () => {
  it('returns exact recovery parameters for missing clinical R dependencies', () => {
    expect(
      packagePreflight('r', {
        inventory: { source: 'full-scan', validation: 'full-scan' },
        packages: [
          { requested: 'survival', name: 'survival', status: 'missing' },
          { requested: 'readxl', name: 'readxl', status: 'missing' },
          { requested: 'survival', name: 'survival', status: 'missing' }
        ]
      })
    ).toEqual({
      scope: 'package-metadata',
      status: 'blocked',
      missingPackages: ['survival', 'readxl'],
      unknownPackages: [],
      importability: 'not-checked',
      executionPermissions: 'not-checked',
      modelQuota: 'unknown',
      recovery: { tool: 'manage_packages', language: 'r', packages: ['survival', 'readxl'] }
    })
  })

  it('does not call an unavailable or cached inventory ready', () => {
    for (const inventory of [
      { source: 'unavailable', validation: 'unavailable' },
      { source: 'cache-reused', validation: 'best-effort' }
    ] as const) {
      expect(
        packagePreflight('python', {
          inventory,
          packages: [{ requested: 'pandas', name: 'pandas', status: 'installed' }]
        })
      ).toMatchObject({ status: 'unknown', modelQuota: 'unknown' })
    }
    const unknown = packagePreflight('python', {
      inventory: { source: 'unavailable', validation: 'unavailable' },
      packages: [{ requested: 'openpyxl', name: 'openpyxl', status: 'unknown' }]
    })
    expect(unknown.unknownPackages).toEqual(['openpyxl'])
    expect(unknown).not.toHaveProperty('recovery')
  })

  it('limits success to package metadata even when all dependencies are present', () => {
    expect(
      packagePreflight('python', {
        inventory: { source: 'full-scan', validation: 'full-scan' },
        packages: ['pandas', 'openpyxl'].map((name) => ({
          requested: name,
          name,
          status: 'installed'
        }))
      })
    ).toMatchObject({
      scope: 'package-metadata',
      status: 'available',
      importability: 'not-checked',
      executionPermissions: 'not-checked',
      modelQuota: 'unknown'
    })
  })

  it('does not certify an empty inventory query', () => {
    expect(
      packagePreflight('r', {
        inventory: { source: 'full-scan', validation: 'full-scan' },
        packages: []
      }).status
    ).toBe('unknown')
  })
})
