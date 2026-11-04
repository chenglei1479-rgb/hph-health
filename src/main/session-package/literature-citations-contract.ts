import { z } from 'zod'

import { packageCitationPdfSchema } from '../../shared/session-package'
import { sha256 } from '../artifacts/provenance-canonical'

export const CITATION_MANIFEST_MAX_CHARS = 4 * 1024 * 1024

// Captured bibliographic snapshots for one immutable Artifact Version. The row mirrors
// ArtifactLiteratureManifest, which is not part of the package's native table allowlist yet must
// survive without the exporting computer's Library.
export const packageCitationManifestSchema = z
  .object({
    artifactVersionId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/),
    schemaVersion: z.number().int().positive(),
    styleId: z.string().min(1).max(256),
    locale: z.string().min(2).max(32),
    manifestJson: z.string().min(1).max(CITATION_MANIFEST_MAX_CHARS),
    checksum: z.string().regex(/^[a-f0-9]{64}$/),
    createdAt: z.string().min(20).max(40)
  })
  .strict()
  .superRefine((entry, context) => {
    // The native reader rejects a manifest whose bytes no longer match its checksum, so a package
    // must not be able to publish one either.
    if (sha256(entry.manifestJson) !== entry.checksum)
      context.addIssue({
        code: 'custom',
        message: 'Cited reference manifest checksum does not match its content.',
        path: ['checksum']
      })
  })

export const packageLiteratureCitationsSchema = z
  .object({
    schemaVersion: z.literal(1),
    artifacts: z.array(packageCitationManifestSchema).max(10000),
    citations: z.array(packageCitationPdfSchema).max(2000)
  })
  .strict()
  .superRefine((value, context) => {
    const versions = new Set<string>()
    for (const [index, artifact] of value.artifacts.entries()) {
      if (versions.has(artifact.artifactVersionId))
        context.addIssue({
          code: 'custom',
          message: 'Cited reference manifests must belong to distinct Artifact Versions.',
          path: ['artifacts', index, 'artifactVersionId']
        })
      versions.add(artifact.artifactVersionId)
    }
    const items = new Set<string>()
    for (const [index, citation] of value.citations.entries()) {
      if (items.has(citation.itemId))
        context.addIssue({
          code: 'custom',
          message: 'A cited reference is described once.',
          path: ['citations', index, 'itemId']
        })
      items.add(citation.itemId)
      if (
        citation.state === 'included' &&
        (citation.reason !== undefined || citation.attachmentVersionId === undefined)
      )
        context.addIssue({
          code: 'custom',
          message:
            'An included citation names the packaged PDF Version and has no omission reason.',
          path: ['citations', index]
        })
      if (citation.state === 'omitted-by-choice') {
        if (citation.attachmentVersionId === undefined)
          context.addIssue({
            code: 'custom',
            message: 'A citation omitted by choice retains the Version metadata that was excluded.',
            path: ['citations', index]
          })
        if (citation.reason !== 'excluded-from-export')
          context.addIssue({
            code: 'custom',
            message: 'A citation omitted by choice reports the export selection as its reason.',
            path: ['citations', index]
          })
      }
      if (citation.state === 'unavailable') {
        if (citation.attachmentVersionId !== undefined)
          context.addIssue({
            code: 'custom',
            message: 'An unavailable citation has no packaged Version.',
            path: ['citations', index]
          })
        if (citation.reason === undefined || citation.reason === 'excluded-from-export')
          context.addIssue({
            code: 'custom',
            message: 'An unavailable citation explains why no PDF was captured.',
            path: ['citations', index]
          })
      }
    }
  })

export type PackageCitationManifest = z.infer<typeof packageCitationManifestSchema>
export type PackageLiteratureCitations = z.infer<typeof packageLiteratureCitationsSchema>
