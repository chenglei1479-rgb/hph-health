import { validatePackageLiteratureSession } from './literature'
import { join } from 'node:path'
import { decodeSessionFile, type PersistedChatSession } from '../../shared/session-persistence'
import { hasCurrentRunningDelegatedAttempt } from '../../shared/delegated-work-projection'
import type { SessionPackageManifest, SessionPackagePreview } from '../../shared/session-package'
import { readPackageArchive, readPackageJson } from './archive'
import { parseNativeRecords } from './native-snapshot'
import type { PackageRecords } from './records-contract'
import { validatePackageRecords } from './validation'

export const assertSettledHistory = (session: PersistedChatSession): void => {
  const context = session.runtimeContext
  if (
    session.activeRun ||
    session.status === 'running' ||
    session.status.startsWith('waiting-') ||
    // Package metadata is untrusted; claimed import identity cannot bypass source validation.
    hasCurrentRunningDelegatedAttempt({ runtimeContext: context }) ||
    context?.permission?.state === 'pending' ||
    context?.plan?.approval === 'pending' ||
    context?.delegatedWork?.messageCommands?.some(
      (command) =>
        command.receipt.status === 'queued' ||
        (command.receipt.status === 'uncertain' && command.receipt.resolution === 'pending')
    ) ||
    context?.delegatedWork?.questionRequests?.some((question) => question.status === 'pending') ||
    (context?.plan?.delivery && ['queued', 'delivering'].includes(context.plan.delivery.state))
  )
    throw new Error('Wait for the Session to finish before exporting it.')
}

export const readSession = async (directory: string): Promise<PersistedChatSession> => {
  const decoded = decodeSessionFile(await readPackageJson(join(directory, 'session.json')), {
    preserveRuntimeState: true,
    preserveLegacyUploadPaths: true
  })
  if (decoded.status !== 'ok')
    throw new Error('Session package contains an invalid or unsupported Session.')
  assertSettledHistory(decoded.session)
  return decoded.session
}
export const preview = (
  manifest: SessionPackageManifest,
  session: PersistedChatSession,
  // Derived rather than stored: a re-export can exclude more PDFs, and the package must never
  // describe the citation evidence it used to carry.
  records?: Pick<PackageRecords, 'literatureCitations'>
): SessionPackagePreview => {
  const citations = records?.literatureCitations?.citations ?? []
  const unavailable = citations.filter((entry) => entry.state === 'unavailable').length
  const omitted = citations.filter((entry) => entry.state === 'omitted-by-choice').length
  return {
    title: manifest.source.title,
    projectName: manifest.source.projectName,
    branchCount: session.conversationGraph?.branches.length ?? 1,
    messageCount: session.conversationGraph?.messages.length ?? session.messages.length,
    fileCount: manifest.inventory.filter(
      (entry) => entry.kind === 'file' || entry.kind === 'notebook'
    ).length,
    totalBytes: manifest.inventory.reduce((total, entry) => total + entry.sizeBytes, 0),
    omissions: [
      ...manifest.omissions,
      ...(unavailable
        ? [
            {
              kind: 'missing' as const,
              description: `Cited reference PDFs unavailable on the computer that exported this package: ${unavailable}. Their citation metadata is included.`
            }
          ]
        : []),
      ...(omitted
        ? [
            {
              kind: 'excluded' as const,
              description: `Cited reference PDFs left out of this package: ${omitted}. Their citation metadata is included.`
            }
          ]
        : []),
      ...manifest.excludedFiles.map((file) => ({
        kind: 'excluded' as const,
        description: file.filename
      }))
    ]
  }
}

export const inspectSessionPackage = async (
  path: string,
  directory: string,
  signal: AbortSignal,
  temporaryRoot?: string
): Promise<SessionPackagePreview> => {
  const manifest = await readPackageArchive(path, directory, signal)
  const session = await readSession(directory)
  if (manifest.source.projectId !== session.projectId || manifest.source.sessionId !== session.id)
    throw new Error('Session package source identity mismatch.')
  const records = parseNativeRecords(await readPackageJson(join(directory, 'records.json')))
  validatePackageLiteratureSession(records, session)
  await validatePackageRecords(directory, manifest, records, signal, manifest.source, temporaryRoot)
  return preview(manifest, session, records)
}
