import type { PreviewFileItem, PreviewFileSource } from '@/stores/preview-workbench-store'
import { FileWarning, ImageOff } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { formatByteSize } from '@/lib/utils'
import type { Annotation } from '../../../../../../shared/annotation-contract'
import type { AnnotationValidationError } from '../../../../../../shared/annotations'
import { ImagePointAnnotationSurface } from '../../annotations/ImagePointAnnotationSurface'
import { ManagedFileDownloadButton } from '../../ManagedFileDownloadButton'
import type { PreviewFileRendererProps } from '../preview-types'
import { PreviewErrorCard, PreviewFallbackCard, PreviewLoadingContent } from '../PreviewFallback'
import { usePreviewRuntime } from '../preview-runtime-context'
import { useCachedPreviewImage } from '../useCachedPreviewImage'
import { usePreviewResourceKey } from '../usePreviewResourceGeneration'
import { ZoomablePreview } from './ZoomablePreview'

// Raster and SVG previews are decoded whole. Above this size the reader offers the download instead
// of decoding a file that would only stall the panel, so the byte budget is stated, not guessed.
const PREVIEW_IMAGE_MAX_BYTES = 50 * 1024 * 1024

// Keeps the download as the only action but never hides the reason: the size is spelled out so the
// reader can tell "too large to render here" apart from "broken".
const ImageTooLargeFallback = ({
  item,
  source
}: {
  item: {
    name: string
    path: string
    projectId?: string
    managedFileId?: string
    selectedVersionId?: string
    size?: number
  }
  source: PreviewFileSource
}): React.JSX.Element => {
  const { t } = useTranslation()
  const runtime = usePreviewRuntime()

  return (
    <PreviewFallbackCard
      icon={FileWarning}
      name={item.name}
      title={t('File too large to preview')}
      message={t('This file is {{size}}. Download it to view.', {
        size: formatByteSize(item.size) ?? ''
      })}
      action={
        <ManagedFileDownloadButton
          source={source}
          path={item.path}
          projectId={item.projectId}
          fileId={item.managedFileId}
          versionId={item.selectedVersionId}
          versionNumber={runtime?.downloadVersionContext?.versionNumber}
          latestVersionId={runtime?.downloadVersionContext?.latestVersionId}
          latestVersionNumber={runtime?.downloadVersionContext?.latestVersionNumber}
          suggestedName={item.name}
          appearance="primary"
          wrapperClassName="mt-3"
        />
      }
    />
  )
}

const ZoomableImage = ({
  url,
  name,
  onError,
  annotationItem,
  activeAnnotations = [],
  onAddAnnotation,
  onUpdateAnnotationNote,
  onRemoveAnnotation,
  onAnnotationError
}: {
  url: string
  name: string
  onError: () => void
  annotationItem?: PreviewFileItem
  activeAnnotations?: readonly Annotation[]
  onAddAnnotation?: (annotation: Annotation) => AnnotationValidationError | undefined
  onUpdateAnnotationNote?: (id: string, note: string) => AnnotationValidationError | undefined
  onRemoveAnnotation?: (id: string) => void
  onAnnotationError?: (error: AnnotationValidationError) => void
}): React.JSX.Element => {
  return (
    <ZoomablePreview showActualSizePresets>
      {annotationItem ? (
        <ImagePointAnnotationSurface
          item={annotationItem}
          src={url}
          activeAnnotations={activeAnnotations}
          onAdd={onAddAnnotation}
          onUpdateNote={onUpdateAnnotationNote}
          onRemove={onRemoveAnnotation}
          onAnnotationError={onAnnotationError}
          onImageError={onError}
        />
      ) : (
        <img
          src={url}
          alt={name}
          className="size-full object-contain"
          draggable={false}
          onError={onError}
        />
      )}
    </ZoomablePreview>
  )
}

export const PreviewImageContent = ({
  path,
  name,
  source = 'artifact',
  projectId,
  sessionId,
  managedFileId,
  selectedVersionId,
  mimeType,
  size,
  mtimeMs,
  annotationItem,
  activeAnnotations,
  onAddAnnotation,
  onUpdateAnnotationNote,
  onRemoveAnnotation,
  onAnnotationError
}: {
  path: string
  name: string
  source?: PreviewFileSource
  projectId?: string
  sessionId?: string
  managedFileId?: string
  selectedVersionId?: string
  mimeType?: string
  size?: number
  mtimeMs?: number
  annotationItem?: PreviewFileItem
  activeAnnotations?: readonly Annotation[]
  onAddAnnotation?: (annotation: Annotation) => AnnotationValidationError | undefined
  onUpdateAnnotationNote?: (id: string, note: string) => AnnotationValidationError | undefined
  onRemoveAnnotation?: (id: string) => void
  onAnnotationError?: (error: AnnotationValidationError) => void
}): React.JSX.Element => {
  const { t } = useTranslation()
  const requestKey = usePreviewResourceKey({
    projectId,
    sessionId,
    source,
    path,
    managedFileId,
    selectedVersionId,
    mimeType,
    size,
    mtimeMs
  })
  const [failedRequestKey, setFailedRequestKey] = useState<string | undefined>(undefined)
  const hasFailed = failedRequestKey === requestKey
  // Decoding stops before the read: a file past the byte budget never reaches the panel at all.
  const tooLarge = typeof size === 'number' && size > PREVIEW_IMAGE_MAX_BYTES
  // A decode failure disables the hook, which releases the protocol capability immediately.
  const state = useCachedPreviewImage(
    {
      projectId,
      sessionId,
      managedFileId,
      selectedVersionId,
      path,
      source,
      mimeType,
      size,
      mtimeMs
    },
    !hasFailed && !tooLarge,
    hasFailed
  )

  if (tooLarge) {
    return (
      <ImageTooLargeFallback
        item={{ name, path, projectId, managedFileId, selectedVersionId, size }}
        source={source ?? 'artifact'}
      />
    )
  }

  if (state.status === 'loading') return <PreviewLoadingContent />

  // Acquisition errors preserve the upstream missing/outside-storage distinction.
  if (state.status === 'error') {
    return (
      <PreviewErrorCard
        name={name}
        error={state.error}
        fallbackMessage={t("Image couldn't be loaded for preview")}
      />
    )
  }

  if (state.status === 'idle' || hasFailed) {
    return (
      <PreviewFallbackCard
        icon={ImageOff}
        name={name}
        message={t("Image couldn't be loaded for preview")}
        retryable
      />
    )
  }

  return (
    <div className="relative size-full overflow-hidden p-4">
      <ZoomableImage
        url={state.url}
        name={name}
        onError={() => setFailedRequestKey(requestKey)}
        annotationItem={annotationItem}
        activeAnnotations={activeAnnotations}
        onAddAnnotation={onAddAnnotation}
        onUpdateAnnotationNote={onUpdateAnnotationNote}
        onRemoveAnnotation={onRemoveAnnotation}
        onAnnotationError={onAnnotationError}
      />
    </div>
  )
}

export const ImagePreviewRenderer = ({
  item,
  activeAnnotations,
  onAddAnnotation,
  onUpdateAnnotationNote,
  onRemoveAnnotation,
  onAnnotationError
}: PreviewFileRendererProps): React.JSX.Element => (
  <PreviewImageContent
    path={item.path}
    name={item.name}
    source={item.source}
    projectId={item.projectId}
    sessionId={item.sessionId}
    managedFileId={item.managedFileId}
    selectedVersionId={item.selectedVersionId}
    mimeType={item.mimeType}
    size={item.size}
    mtimeMs={item.mtimeMs}
    annotationItem={item}
    activeAnnotations={activeAnnotations}
    onAddAnnotation={onAddAnnotation}
    onUpdateAnnotationNote={onUpdateAnnotationNote}
    onRemoveAnnotation={onRemoveAnnotation}
    onAnnotationError={onAnnotationError}
  />
)
