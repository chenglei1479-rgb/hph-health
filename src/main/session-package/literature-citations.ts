import type { PrismaClient } from '@prisma/client'

import { artifactLiteratureManifestSchema } from '../../shared/artifact-literature'
import type { PackageCitationPdf, PackageCitationPdfReason } from '../../shared/session-package'
import type { PackageCitationManifest } from './literature-citations-contract'
import {
  packageCitationManifestSchema,
  packageLiteratureCitationsSchema
} from './literature-citations-contract'
import type { PackageRecords } from './records-contract'

// How a cited reference's full text was resolved against the exporting computer's Library.
// `attachmentId` travels with `versionId` so the caller can turn a Version into the storage key the
// export selection speaks in without a second lookup.
export type ResolvedCitedPdf =
  { versionId: string; attachmentId: string } | { reason: PackageCitationPdfReason }

const isPdf = (contentType: string, filename: string): boolean =>
  contentType.split(';')[0].trim().toLowerCase() === 'application/pdf' ||
  filename.toLowerCase().endsWith('.pdf')

// A citation manifest is immutable evidence for one Artifact Version. Copy the stored bytes verbatim
// and let the contract reject a manifest whose checksum no longer matches, instead of re-encoding it
// here and hiding the corruption.
export const captureCitationManifests = async (
  client: PrismaClient,
  artifactVersionIds: readonly string[]
): Promise<PackageCitationManifest[]> => {
  if (!artifactVersionIds.length) return []
  const rows = await client.artifactLiteratureManifest.findMany({
    where: { artifactVersionId: { in: [...artifactVersionIds] } },
    orderBy: { artifactVersionId: 'asc' }
  })
  return rows.map((row) =>
    packageCitationManifestSchema.parse({
      artifactVersionId: row.artifactVersionId,
      schemaVersion: row.schemaVersion,
      styleId: row.styleId,
      locale: row.locale,
      manifestJson: row.manifestJson,
      checksum: row.checksum,
      createdAt: row.createdAt.toISOString()
    })
  )
}

// Bibliography references only. A frozen review corpus is a screening candidate list (up to a
// thousand items), not the set of works this Session cites, so its PDFs stay out of the package.
export const citedItemIds = (manifests: readonly PackageCitationManifest[]): string[] => {
  const ids = new Set<string>()
  for (const manifest of manifests) {
    const parsed = artifactLiteratureManifestSchema.parse(JSON.parse(manifest.manifestJson))
    for (const reference of parsed.references) ids.add(reference.itemId)
  }
  return [...ids]
}

// Which single PDF stands for a cited item, following the reader convention: a `fullText`
// attachment first, then any other attachment, and within one attachment its newest Version. A
// Version that already travels for another reason is reused so one Literature Attachment never
// contributes two Versions to the same package.
export const resolveCitedPdfs = async (
  client: PrismaClient,
  itemIds: readonly string[],
  packagedVersionIds: ReadonlySet<string>
): Promise<Map<string, ResolvedCitedPdf>> => {
  const resolutions = new Map<string, ResolvedCitedPdf>()
  if (!itemIds.length) return resolutions
  const packaged = packagedVersionIds.size
    ? await client.literatureAttachmentVersion.findMany({
        where: { id: { in: [...packagedVersionIds] } },
        select: { id: true, attachmentId: true }
      })
    : []
  const packagedByAttachment = new Map(packaged.map((row) => [row.attachmentId, row.id]))
  const items = await client.literatureItem.findMany({
    where: { id: { in: [...itemIds] } },
    include: {
      attachments: {
        include: {
          versions: {
            orderBy: { versionNumber: 'desc' },
            take: 1,
            include: { contentBlob: { select: { state: true } } }
          }
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
      }
    }
  })
  const byId = new Map(items.map((item) => [item.id, item]))
  for (const itemId of itemIds) {
    const item = byId.get(itemId)
    if (!item || item.deletedAt || item.mergedIntoItemId) {
      resolutions.set(itemId, { reason: 'item-removed' })
      continue
    }
    const attachments = [
      ...item.attachments.filter(({ kind }) => kind === 'fullText'),
      ...item.attachments.filter(({ kind }) => kind !== 'fullText')
    ]
    let sawPdf = false
    let resolved: ResolvedCitedPdf | undefined
    for (const attachment of attachments) {
      const version = attachment.versions[0]
      if (!version || !isPdf(version.contentType, version.filename)) continue
      sawPdf = true
      if (version.contentBlob.state !== 'available') continue
      resolutions.set(
        itemId,
        packagedByAttachment.has(attachment.id)
          ? { versionId: packagedByAttachment.get(attachment.id)!, attachmentId: attachment.id }
          : { versionId: version.id, attachmentId: attachment.id }
      )
      resolved = resolutions.get(itemId)
      break
    }
    if (!resolved) resolutions.set(itemId, { reason: sawPdf ? 'content-unavailable' : 'no-pdf' })
  }
  return resolutions
}

// The cited PDF Versions that the export must offer as optional Literature content.
export const citedPdfVersionIds = (
  resolutions: ReadonlyMap<string, ResolvedCitedPdf>,
  packagedVersionIds: ReadonlySet<string>
): string[] => [
  ...new Set(
    [...resolutions.values()].flatMap((entry) =>
      'versionId' in entry && !packagedVersionIds.has(entry.versionId) ? [entry.versionId] : []
    )
  )
]

// One entry per cited reference. The exporting computer is the only place that can still tell
// "the Library has no PDF" from "the researcher left it out", so both answers are recorded here.
export const packageCitationInventory = (
  itemIds: readonly string[],
  resolutions: ReadonlyMap<string, ResolvedCitedPdf>,
  excludedStorageKeys: ReadonlySet<string>,
  literatureStorageKey: (attachmentId: string, versionId: string) => string
): PackageCitationPdf[] =>
  itemIds.map((itemId) => {
    const resolution = resolutions.get(itemId)
    if (!resolution || !('versionId' in resolution))
      return {
        itemId,
        state: 'unavailable' as const,
        reason: resolution?.reason ?? ('no-pdf' as const)
      }
    const attachmentVersionId = resolution.versionId
    const excluded = excludedStorageKeys.has(
      literatureStorageKey(resolution.attachmentId, resolution.versionId)
    )
    return excluded
      ? {
          itemId,
          state: 'omitted-by-choice' as const,
          reason: 'excluded-from-export' as const,
          attachmentVersionId
        }
      : { itemId, state: 'included' as const, attachmentVersionId }
  })

// Records-level invariants only. Whether an excluded citation is also absent from the inventory is
// a selection question and stays in validatePackageRecords, which owns the manifest.
export const validatePackageLiteratureCitations = (records: PackageRecords): void => {
  if (!records.literatureCitations) return
  const value = packageLiteratureCitationsSchema.parse(records.literatureCitations)
  const versions = new Set(records.tables.ArtifactVersion.map((row) => String(row.id)))
  const references = new Set<string>()
  for (const artifact of value.artifacts) {
    if (!versions.has(artifact.artifactVersionId))
      throw new Error('Cited reference manifest has no packaged Artifact Version.')
    const parsed = artifactLiteratureManifestSchema.parse(JSON.parse(artifact.manifestJson))
    for (const reference of parsed.references) references.add(reference.itemId)
  }
  const described = new Set(value.citations.map((citation) => citation.itemId))
  for (const itemId of references)
    if (!described.has(itemId)) throw new Error('A cited reference has no packaged PDF state.')
  const attachments = new Map(
    (records.literature?.attachments ?? []).map((entry) => [entry.versionId, entry])
  )
  const uploaded = new Set(records.tables.UploadVersion.map((row) => String(row.id)))
  for (const citation of value.citations) {
    if (citation.state === 'unavailable') continue
    const entry = attachments.get(citation.attachmentVersionId!)
    if (!entry || entry.itemId !== citation.itemId || !uploaded.has(citation.attachmentVersionId!))
      throw new Error('A cited reference PDF is not a packaged Literature Attachment.')
  }
}

// Whether an omitted citation is truly absent from the archive is a property of the written
// package, not of records.json alone, so it is checked next to the manifest's own inventory.
export const assertCitationPdfSelection = (
  records: PackageRecords,
  excluded: ReadonlySet<string>
): void => {
  const versions = new Map(
    records.tables.UploadVersion.map((row) => [String(row.id), String(row.contentStorageKey)])
  )
  for (const citation of records.literatureCitations?.citations ?? []) {
    if (citation.state === 'unavailable') continue
    const key = versions.get(citation.attachmentVersionId!)
    if (key === undefined) throw new Error('A cited reference PDF has no packaged content.')
    if (citation.state === 'included' && excluded.has(key))
      throw new Error('A citation reported as included is excluded from the package.')
    if (citation.state === 'omitted-by-choice' && !excluded.has(key))
      throw new Error('A citation reported as omitted by choice is still in the package.')
  }
}

// Restate the citation selection a re-exported package now ships. The bytes are already gone when a
// package is forwarded, so this can only tighten a state, never restore one.
export const applyCitationExclusions = (
  records: PackageRecords,
  excluded: ReadonlySet<string>
): void => {
  const versions = new Map(
    records.tables.UploadVersion.map((row) => [String(row.id), String(row.contentStorageKey)])
  )
  for (const citation of records.literatureCitations?.citations ?? []) {
    if (citation.state !== 'included') continue
    const key = versions.get(citation.attachmentVersionId!)
    if (key === undefined || !excluded.has(key)) continue
    citation.state = 'omitted-by-choice'
    citation.reason = 'excluded-from-export'
  }
}
