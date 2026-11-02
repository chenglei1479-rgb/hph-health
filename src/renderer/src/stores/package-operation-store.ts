import { create } from 'zustand'
import { PACKAGE_MAX_FILE_BYTES } from '../../../shared/session-package'
import type { PackageOperationSnapshot } from '../../../shared/session-package'

// One file the reader asked to include before the package selector existed.
export type ResearchPackagePreselect = {
  fileId: string
  // When present only this Version is checked. Callers that know which Version is on screen always
  // pass it, so "add this file" never silently pulls in older and newer Versions.
  versionId?: string
  filename: string
}

export const usePackageOperationStore = create<{
  operation: PackageOperationSnapshot | null
  errorKind?: 'fork'
  importError?: string
  setImportError: (error: string | undefined) => void
  open: boolean
  dismissedId?: string
  dismiss: () => void
  excludedStorageKeys: string[] | null
  selectionPreset: 'full' | 'compact' | 'custom'
  // One file the reader asked to include before the selector existed. It is an initial value only:
  // it is consumed by the next selection snapshot and never locks the checkboxes. `versionId` pins
  // the exact Version the reader was looking at; without it every Version of the file is checked.
  preselect: ResearchPackagePreselect | null
  preselectResearchPackageFile: (target: ResearchPackagePreselect) => void
  clearPreselect: () => void
  threshold: string
  setThreshold: (threshold: string) => void
  receive: (operation: PackageOperationSnapshot | null) => void
  setOpen: (open: boolean) => void
}>((set) => ({
  operation: null,
  setImportError: (importError) => set({ importError }),
  open: false,
  excludedStorageKeys: null,
  selectionPreset: 'compact',
  preselect: null,
  preselectResearchPackageFile: (target) =>
    // A second request replaces the first: only one file is ever pre-checked.
    set({ preselect: target }),
  clearPreselect: () => set({ preselect: null }),
  threshold: '256',
  setThreshold: (threshold) => set({ threshold }),
  dismiss: () =>
    set((state) =>
      packageOperationActive(state.operation)
        ? {}
        : { open: false, dismissedId: state.operation?.id }
    ),
  receive: (operation) =>
    set((state) => {
      const same = operation?.id === state.operation?.id
      const retry =
        state.operation?.state === 'failed' &&
        operation?.kind === 'export' &&
        state.operation.kind === 'export' &&
        operation.session?.projectId === state.operation.session?.projectId &&
        operation.session?.sessionId === state.operation.session?.sessionId
      const draft = same || retry ? state.excludedStorageKeys : null
      const preset = same || retry ? state.selectionPreset : 'compact'
      const available =
        operation?.files &&
        new Set(
          operation.files.filter((file) => !file.requiredForEvidence).map((file) => file.storageKey)
        )
      const excluded = operation?.files
        ? [
            ...new Set([
              ...(preset === 'compact'
                ? operation.files
                    .filter((file) => !file.requiredForEvidence)
                    .map((file) => file.storageKey)
                : (draft ?? []).filter((key) => available!.has(key))),
              ...operation.files
                .filter(
                  (file) => !file.requiredForEvidence && file.sizeBytes > PACKAGE_MAX_FILE_BYTES
                )
                .map((file) => file.storageKey)
            ])
          ]
        : draft
      // The reader asked for one file before the selector existed. When the request names a Version,
      // only that Version is checked — the others of the same file stay excluded, because a reader
      // looking at v2 did not ask for v1..v5. The request seeds the first snapshot only, so later
      // manual edits and cancellations never resurrect it.
      const request = state.preselect
      const preselectedKeys = request
        ? new Set(
            (operation?.files ?? [])
              .filter((file) =>
                request.versionId
                  ? file.groupId === request.fileId && file.versionId === request.versionId
                  : file.groupId === request.fileId && file.filename === request.filename
              )
              .map((file) => file.storageKey)
          )
        : undefined
      const preselectApplies =
        operation?.state === 'awaiting-selection' &&
        preselectedKeys !== undefined &&
        preselectedKeys.size > 0
      const nextExcluded =
        preselectApplies && excluded
          ? excluded.filter((key) => !preselectedKeys!.has(key))
          : excluded
      return {
        operation,
        dismissedId: same ? state.dismissedId : undefined,
        excludedStorageKeys: nextExcluded,
        preselect:
          preselectApplies ||
          (operation?.state !== undefined &&
            ['succeeded', 'cancelled', 'failed'].includes(operation.state))
            ? null
            : state.preselect,
        selectionPreset:
          preselectApplies
            ? 'custom'
            : preset === 'compact' &&
                operation?.files?.some(
                  (file) => file.source === 'literature' && file.requiredForEvidence
                )
              ? 'custom'
              : operation?.files?.some((file) => file.sizeBytes > PACKAGE_MAX_FILE_BYTES) &&
                  preset === 'full'
                ? 'custom'
                : preset,
        threshold: same || retry ? state.threshold : '256',
        open:
          same && state.dismissedId === operation?.id
            ? false
            : (same && operation?.presentationRevision !== state.operation?.presentationRevision) ||
                operation?.state === 'awaiting-selection' ||
                (!same && operation?.state === 'running')
              ? true
              : state.open
      }
    }),
  setOpen: (open) => set({ open })
}))

export const packageOperationActive = (operation: PackageOperationSnapshot | null): boolean =>
  operation !== null && ['running', 'awaiting-selection', 'cancelling'].includes(operation.state)

export const sessionExportLocked = (
  operation: PackageOperationSnapshot | null,
  session: { id: string; projectId: string } | undefined
): boolean =>
  Boolean(
    session &&
    (operation?.kind === 'export' || operation?.kind === 'fork') &&
    operation.progress.phase !== 'cleaning' &&
    packageOperationActive(operation) &&
    operation.session?.sessionId === session.id &&
    operation.session.projectId === session.projectId
  )
