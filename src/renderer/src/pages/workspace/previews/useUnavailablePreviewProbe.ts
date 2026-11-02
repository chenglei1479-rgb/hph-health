import { useEffect, useState } from 'react'

import type { PreviewFileSource } from '@/stores/preview-workbench-store'

import { createPreviewRequestScope, getPreviewFileReader } from './preview-file-reader'
import {
  isManagedFilePublicationPendingError,
  isUnavailableFileError
} from './preview-errors'

// Three states a managed file can be in while its card is on screen. `ready` also covers "not probed
// yet": the card renders normally and the state stays quiet until a read proves otherwise.
export type ManagedFileAvailability = 'ready' | 'publishing' | 'missing'

type AvailabilityProbeResult = {
  requestKey: string
  availability: ManagedFileAvailability
}

// Probes one managed file only while its card is near the viewport and caches by file revision.
const useManagedFileAvailability = ({
  enabled,
  projectId,
  sessionId,
  managedFileId,
  selectedVersionId,
  path,
  source,
  size,
  mtimeMs
}: {
  enabled: boolean
  projectId?: string
  sessionId?: string
  managedFileId?: string
  selectedVersionId?: string
  path: string
  source: PreviewFileSource
  size?: number
  mtimeMs?: number
}): ManagedFileAvailability => {
  const requestKey = JSON.stringify([
    projectId ?? null,
    sessionId ?? null,
    source,
    managedFileId ?? null,
    selectedVersionId ?? null,
    path,
    size ?? null,
    mtimeMs ?? null
  ])
  const [result, setResult] = useState<AvailabilityProbeResult | null>(null)
  const hasCurrentResult = result?.requestKey === requestKey

  useEffect(() => {
    if (!enabled || hasCurrentResult) return

    let canceled = false
    const readPreview = getPreviewFileReader(source)

    // One byte verifies path availability without retaining file content in the card.
    void readPreview({
      ...createPreviewRequestScope({ projectId, sessionId, source, path }),
      path,
      ...(managedFileId ? { fileId: managedFileId } : {}),
      ...(selectedVersionId ? { versionId: selectedVersionId } : {}),
      maxBytes: 1,
      encoding: 'base64'
    }).then(
      () => {
        if (!canceled) setResult({ requestKey, availability: 'ready' })
      },
      (error: unknown) => {
        if (canceled) return
        // A generated file can be readable before its turn-level finalization publishes the first
        // Version; that is a transient state, not a missing file.
        const availability: ManagedFileAvailability = isManagedFilePublicationPendingError(error)
          ? 'publishing'
          : isUnavailableFileError(error)
            ? 'missing'
            : 'ready'
        setResult({ requestKey, availability })
      }
    )

    return () => {
      canceled = true
    }
  }, [
    enabled,
    hasCurrentResult,
    managedFileId,
    path,
    projectId,
    requestKey,
    selectedVersionId,
    sessionId,
    source
  ])

  return hasCurrentResult ? result.availability : 'ready'
}

// Boolean view of the same probe for cards that only need the unavailable badge.
const useUnavailablePreviewProbe = (input: Parameters<typeof useManagedFileAvailability>[0]): boolean =>
  useManagedFileAvailability(input) === 'missing'

export { useManagedFileAvailability, useUnavailablePreviewProbe }
