import { literatureItemInputSchema } from '@aipoch/literature-library/item'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { createTestPdf } from '../../../test/fixtures/literature-pdf'
import type { PersistedChatSession } from '../../shared/session-persistence'
import { canonicalJson, sha256 } from '../artifacts/provenance-canonical'
import { createProvenanceTestFixture } from '../artifacts/provenance-test-fixtures'
import { LiteratureAttachmentAuthority } from '../literature/attachment-authority'
import { ManagedFileVersionService } from '../managed-file-versions/service'
import { SessionRepository } from '../session-persistence/repository'
import * as storageRoots from '../storage-root'
import { ContentRepository } from '../storage/content-repository'
import { PackageLiteratureReader } from './literature-reader'
import { packageCitationInventory, citedPdfVersionIds } from './literature-citations'
import { SessionPackageService } from './service'

vi.mock('electron', () => ({
  app: { getPath: () => '/home/user', isPackaged: true },
  safeStorage: { isEncryptionAvailable: () => false }
}))
const fixtures: Awaited<ReturnType<typeof createProvenanceTestFixture>>[] = []
const services: SessionPackageService[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const service of services.splice(0)) await service.close()
  for (const fixture of fixtures.splice(0)) await fixture.dispose()
})
const setup = async (): Promise<
  Awaited<ReturnType<typeof createProvenanceTestFixture>> & { service: SessionPackageService }
> => {
  const fixture = await createProvenanceTestFixture()
  fixtures.push(fixture)
  vi.spyOn(storageRoots, 'resolveDataRoot').mockReturnValue(fixture.storageRoot)
  const service = new SessionPackageService({
    storageRoot: fixture.storageRoot,
    getClient: async () => fixture.client
  })
  services.push(service)
  return { ...fixture, service }
}

const citedItem = (): ReturnType<typeof literatureItemInputSchema.parse> =>
  literatureItemInputSchema.parse({ itemType: 'journalArticle', title: 'Evidence paper' })

const sessionWithCitedArtifact = (): PersistedChatSession => ({
  id: 'session-1',
  projectId: 'project-1',
  title: 'Writing the manuscript',
  cwd: '',
  status: 'idle',
  createdAt: 1,
  updatedAt: 1,
  messages: [
    {
      id: 'message-1',
      role: 'agent',
      content: '',
      createdAt: 1,
      updatedAt: 1,
      status: 'complete',
      eventIds: [],
      parts: [
        {
          type: 'artifact',
          id: 'artifact-version-1',
          name: 'manuscript.docx',
          path: 'artifacts/project-1/session-1/manuscript.docx',
          source: 'artifact',
          versionId: 'artifact-version-1'
        }
      ]
    }
  ]
})

// Mirrors what an Agent save leaves behind: an immutable Artifact Version, the cited-reference
// manifest that belongs to it, and — optionally — a Library PDF for the cited item.
const seedCitedArtifact = async (
  source: Awaited<ReturnType<typeof setup>>,
  options: { pdf: boolean } = { pdf: true }
): Promise<void> => {
  const { client, storageRoot } = source
  await client.project.create({ data: { id: 'project-1', name: 'Writing' } })
  await client.fileOriginSession.create({
    data: { projectId: 'project-1', sessionId: 'session-1', titleSnapshot: 'Writing' }
  })
  const manuscriptKey = 'artifacts/project-1/session-1/manuscript.docx'
  await mkdir(dirname(join(storageRoot, manuscriptKey)), { recursive: true })
  await writeFile(join(storageRoot, manuscriptKey), 'manuscript')
  await client.artifactLineage.create({
    data: {
      id: 'artifact-1',
      projectId: 'project-1',
      sessionId: 'session-1',
      normalizedFilename: 'manuscript.docx',
      filename: 'manuscript.docx'
    }
  })
  await client.artifactVersion.create({
    data: {
      id: 'artifact-version-1',
      artifactId: 'artifact-1',
      versionNumber: 1,
      filename: 'manuscript.docx',
      originKind: 'legacy',
      state: 'finalized',
      contentStorageKey: manuscriptKey,
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      sizeBytes: BigInt('manuscript'.length),
      checksum: sha256('manuscript')
    }
  })
  await client.literatureItem.create({
    data: { id: 'item-1', itemType: 'journalArticle', title: 'Evidence paper', metadataRevision: 3 }
  })
  if (options.pdf) {
    const pdf = createTestPdf()
    await mkdir(join(storageRoot, 'content/blobs'), { recursive: true })
    await writeFile(join(storageRoot, 'content/blobs/paper'), pdf)
    await client.contentBlob.create({
      data: {
        id: 'blob-1',
        storageKey: 'content/blobs/paper',
        checksum: sha256(pdf),
        sizeBytes: BigInt(pdf.length),
        contentType: 'application/pdf',
        state: 'available'
      }
    })
    await client.literatureAttachment.create({
      data: {
        id: 'attachment-1',
        itemId: 'item-1',
        versions: {
          create: {
            id: 'version-1',
            contentBlobId: 'blob-1',
            versionNumber: 1,
            filename: 'paper.pdf',
            contentType: 'application/pdf',
            sizeBytes: BigInt(pdf.length),
            checksum: sha256(pdf)
          }
        }
      }
    })
  }
  const manifestJson = canonicalJson(
    JSON.parse(
      JSON.stringify({
        schemaVersion: 1,
        styleId: 'apa',
        locale: 'en-US',
        references: [{ itemId: 'item-1', metadataRevision: 3, item: citedItem() }],
        citations: [{ citationId: 'citation-1', itemId: 'item-1', metadataRevision: 3 }]
      })
    )
  )
  await client.artifactLiteratureManifest.create({
    data: {
      artifactVersionId: 'artifact-version-1',
      schemaVersion: 1,
      styleId: 'apa',
      locale: 'en-US',
      manifestJson,
      checksum: sha256(manifestJson)
    }
  })
  await new SessionRepository(storageRoot).saveSession(sessionWithCitedArtifact())
}

const exportArchive = async (
  source: Awaited<ReturnType<typeof setup>>,
  options: { excluded?: readonly string[]; offered?: boolean } = {}
): Promise<string> => {
  const archive = join(source.storageRoot, 'writing.science')
  await source.service.exportTo({ projectId: 'project-1', sessionId: 'session-1' }, archive, {
    selectFiles: async (files) => {
      expect(
        files.some((file) => file.source === 'literature' && file.filename === 'paper.pdf')
      ).toBe(options.offered ?? true)
      return files
        .filter((file) => options.excluded?.includes(file.filename))
        .map((file) => file.storageKey)
    }
  })
  return archive
}

it('carries a cited reference PDF, its manifest and its status into the imported history', async () => {
  const source = await setup(),
    target = await setup()
  await seedCitedArtifact(source)
  const archive = await exportArchive(source)
  const imported = await target.service.importFrom(archive)
  const saved = (await new SessionRepository(target.storageRoot).loadSession(
    imported.projectId,
    imported.sessionId
  ))!
  const citation = saved.packageOrigin?.citations?.[0]
  expect(citation).toMatchObject({ state: 'included' })
  expect(citation?.attachmentVersionId).toBeDefined()
  // The citation list survives without the exporting computer's Library.
  const manifest = await target.client.artifactLiteratureManifest.findFirstOrThrow()
  const parsed = JSON.parse(manifest.manifestJson)
  expect(parsed.references[0].itemId).toBe(citation?.itemId)
  expect(manifest.checksum).toBe(sha256(manifest.manifestJson))
  expect(manifest.artifactVersionId).not.toBe('artifact-version-1')
  // The PDF itself is in the package and belongs to the same citation.
  const version = await target.client.uploadVersion.findUniqueOrThrow({
    where: { id: citation!.attachmentVersionId! }
  })
  expect(version).toMatchObject({
    filename: 'paper.pdf',
    contentType: 'application/pdf',
    checksum: sha256(createTestPdf())
  })
  expect(await readFile(join(target.storageRoot, version.contentStorageKey))).toEqual(
    createTestPdf()
  )
  // "In the package" must also mean readable there, with no Library rows on the receiving computer.
  expect(await target.client.literatureItem.count()).toBe(0)
  const reader = new PackageLiteratureReader({
    storageRoot: target.storageRoot,
    getClient: async () => target.client,
    files: new ManagedFileVersionService({
      storageRoot: target.storageRoot,
      getClient: async () => target.client
    })
  })
  const authority = new LiteratureAttachmentAuthority({
    getClient: async () => target.client,
    content: new ContentRepository({
      storageRoot: target.storageRoot,
      getClient: async () => target.client
    }),
    packages: reader
  })
  const lease = await authority.openContent(citation!.attachmentVersionId!)
  try {
    expect(await readFile(lease.path)).toEqual(createTestPdf())
  } finally {
    await lease.close()
  }
}, 120_000)

it('records a cited PDF left out of the export as omitted by choice', async () => {
  const source = await setup(),
    target = await setup()
  await seedCitedArtifact(source)
  const archive = await exportArchive(source, { excluded: ['paper.pdf'] })
  const imported = await target.service.importFrom(archive)
  const saved = (await new SessionRepository(target.storageRoot).loadSession(
    imported.projectId,
    imported.sessionId
  ))!
  expect(saved.packageOrigin?.citations?.[0]).toMatchObject({
    state: 'omitted-by-choice',
    reason: 'excluded-from-export'
  })
  // The citation metadata still travels; only the bytes are gone.
  const manifest = await target.client.artifactLiteratureManifest.findFirstOrThrow()
  expect(JSON.parse(manifest.manifestJson).references[0].item.title).toBe('Evidence paper')
  expect(
    await target.client.uploadVersion.count({
      where: { id: saved.packageOrigin!.citations![0]!.attachmentVersionId! }
    })
  ).toBe(1)
}, 120_000)

it('records a citation whose PDF never existed on the exporting computer', async () => {
  const source = await setup(),
    target = await setup()
  await seedCitedArtifact(source, { pdf: false })
  const archive = await exportArchive(source, { offered: false })
  const imported = await target.service.importFrom(archive)
  const saved = (await new SessionRepository(target.storageRoot).loadSession(
    imported.projectId,
    imported.sessionId
  ))!
  expect(saved.packageOrigin?.citations).toEqual([
    { itemId: expect.any(String), state: 'unavailable', reason: 'no-pdf' }
  ])
  const manifest = await target.client.artifactLiteratureManifest.findFirstOrThrow()
  expect(JSON.parse(manifest.manifestJson).references[0].item.title).toBe('Evidence paper')
  expect(await target.client.uploadVersion.count()).toBe(0)
}, 120_000)

it('restates a citation as omitted when a re-exported package drops its PDF', async () => {
  const source = await setup(),
    target = await setup()
  await seedCitedArtifact(source)
  const imported = await target.service.importFrom(await exportArchive(source))
  const forwarded = join(target.storageRoot, 'forwarded.science')
  await target.service.exportTo(imported, forwarded, {
    selectFiles: async (files) => files.map((file) => file.storageKey)
  })
  const second = await target.service.importFrom(forwarded)
  const saved = (await new SessionRepository(target.storageRoot).loadSession(
    second.projectId,
    second.sessionId
  ))!
  expect(saved.packageOrigin?.citations?.[0]).toMatchObject({
    state: 'omitted-by-choice',
    reason: 'excluded-from-export'
  })
}, 120_000)

it('offers a cited PDF once and never twice for one Attachment', () => {
  const resolutions = new Map([
    ['item-1', { versionId: 'version-1', attachmentId: 'attachment-1' as const }],
    ['item-2', { reason: 'no-pdf' as const }]
  ])
  expect(citedPdfVersionIds(resolutions, new Set())).toEqual(['version-1'])
  expect(citedPdfVersionIds(resolutions, new Set(['version-1']))).toEqual([])
  const key = (attachmentId: string, versionId: string): string =>
    `uploads/project-1/session-1/${attachmentId}/versions/${versionId}/content`
  expect(
    packageCitationInventory(
      ['item-1', 'item-2'],
      resolutions,
      new Set([key('attachment-1', 'version-1')]),
      key
    )
  ).toEqual([
    {
      itemId: 'item-1',
      state: 'omitted-by-choice',
      reason: 'excluded-from-export',
      attachmentVersionId: 'version-1'
    },
    { itemId: 'item-2', state: 'unavailable', reason: 'no-pdf' }
  ])
})
