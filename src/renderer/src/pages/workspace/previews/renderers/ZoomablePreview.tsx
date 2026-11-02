import { Expand, Maximize2, Shrink, ZoomIn, ZoomOut } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { TransformComponent, TransformWrapper, useControls } from 'react-zoom-pan-pinch'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

const prefersReducedMotion = (): boolean =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

const PreviewZoomControls = ({
  reduceMotion,
  tooltipClassName,
  showActualSizePresets
}: {
  reduceMotion: boolean
  tooltipClassName?: string
  showActualSizePresets: boolean
}): React.JSX.Element => {
  const { t } = useTranslation()
  const { zoomIn, zoomOut, resetTransform, setTransform, instance } = useControls()
  const actions = [
    { label: t('Zoom in'), icon: ZoomIn, onClick: () => zoomIn() },
    { label: t('Zoom out'), icon: ZoomOut, onClick: () => zoomOut() },
    {
      label: t('Reset zoom'),
      icon: Shrink,
      onClick: () => resetTransform(reduceMotion ? 0 : undefined)
    }
  ]
  // The fitted view is the reset transform: `object-contain` already scales the image down to its
  // box. 100% is that same fitted image scaled back up to the file's intrinsic pixel size, so the
  // two presets are named states a reader can rely on instead of a free zoom level.
  const fitToWindow = (): void => resetTransform(reduceMotion ? 0 : undefined)
  const actualSize = (): void => {
    const wrapper = instance.wrapperComponent
    const image = wrapper?.querySelector('img')
    if (!wrapper || !image || !image.naturalWidth || !image.naturalHeight) return
    const box = wrapper.getBoundingClientRect()
    if (!box.width || !box.height) return
    const fitScale = Math.min(box.width / image.naturalWidth, box.height / image.naturalHeight)
    setTransform(fitScale > 0 ? Math.max(1, 1 / fitScale) : 1, 0, 0)
  }

  return (
    <TooltipProvider>
      <div className="absolute bottom-3 right-3 z-10 flex gap-1 rounded-md border border-border-300/50 bg-bg-000/90 p-1 shadow-sm backdrop-blur">
        {showActualSizePresets ? (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="text-text-100 hover:text-text-000"
                  aria-label={t('Fit to window')}
                  onClick={fitToWindow}
                >
                  <Maximize2 aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className={tooltipClassName}>{t('Fit to window')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="text-text-100 hover:text-text-000"
                  aria-label={t('Actual size')}
                  onClick={actualSize}
                >
                  <Expand aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className={tooltipClassName}>{t('Actual size')}</TooltipContent>
            </Tooltip>
            <span className="mx-0.5 my-1 w-px shrink-0 bg-border-300/60" aria-hidden="true" />
          </>
        ) : null}
        {actions.map(({ label, icon: Icon, onClick }) => (
          <Tooltip key={label}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="text-text-100 hover:text-text-000"
                aria-label={label}
                onClick={onClick}
              >
                <Icon aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className={tooltipClassName}>{label}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  )
}

const ZoomablePreview = ({
  children,
  tooltipClassName,
  showActualSizePresets = false
}: {
  children: React.ReactNode
  tooltipClassName?: string
  showActualSizePresets?: boolean
}): React.JSX.Element => {
  const reduceMotion = prefersReducedMotion()

  return (
    <TransformWrapper
      minScale={1}
      maxScale={8}
      centerOnInit
      zoomAnimation={{ disabled: reduceMotion }}
      doubleClick={reduceMotion ? { mode: 'reset', animationTime: 0 } : { mode: 'reset' }}
      wheel={{
        step: 0.2,
        activationKeys: (keys) => keys.includes('Control') || keys.includes('Meta')
      }}
      panning={{ velocityDisabled: true }}
    >
      <PreviewZoomControls
        reduceMotion={reduceMotion}
        tooltipClassName={tooltipClassName}
        showActualSizePresets={showActualSizePresets}
      />
      <TransformComponent
        wrapperClass="!size-full cursor-grab active:cursor-grabbing"
        contentClass="!size-full"
      >
        {children}
      </TransformComponent>
    </TransformWrapper>
  )
}

export { ZoomablePreview }
