import type { NotebookLanguage } from '../../shared/notebook'
import type { PackageInspectionResult } from './environment-state-tracker'

type NotebookPackagePreflight = {
  scope: 'package-metadata'
  status: 'available' | 'blocked' | 'unknown'
  missingPackages: string[]
  unknownPackages: string[]
  importability: 'not-checked'
  executionPermissions: 'not-checked'
  modelQuota: 'unknown'
  recovery?: {
    tool: 'manage_packages'
    language: NotebookLanguage
    packages: string[]
  }
}

// Metadata inspection neither executes analysis nor authorizes an install. In particular, do not
// turn a failed inventory scan into a missing-package result or claim that model quota was checked.
const packagePreflight = (
  language: NotebookLanguage,
  inspection: PackageInspectionResult
): NotebookPackagePreflight => {
  const missingPackages = [
    ...new Set(
      inspection.packages.filter((pkg) => pkg.status === 'missing').map((pkg) => pkg.requested)
    )
  ]
  const unknownPackages = [
    ...new Set(
      inspection.packages.filter((pkg) => pkg.status === 'unknown').map((pkg) => pkg.requested)
    )
  ]
  const unknownInventory = inspection.inventory.validation !== 'full-scan'
  return {
    scope: 'package-metadata',
    status: missingPackages.length
      ? 'blocked'
      : unknownInventory || unknownPackages.length || !inspection.packages.length
        ? 'unknown'
        : 'available',
    missingPackages,
    unknownPackages,
    importability: 'not-checked',
    executionPermissions: 'not-checked',
    modelQuota: 'unknown',
    ...(missingPackages.length
      ? {
          recovery: { tool: 'manage_packages', language, packages: missingPackages }
        }
      : {})
  }
}

export { packagePreflight, type NotebookPackagePreflight }
