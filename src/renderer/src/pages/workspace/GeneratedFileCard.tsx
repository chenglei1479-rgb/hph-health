import type { ReactNode, Ref } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ExtensionPreservingFileName } from './ExtensionPreservingFileName'

export const artifactCardClassName =
  'h-[82px] w-[128px] shrink-0 cursor-pointer overflow-hidden rounded-lg border border-border-200 bg-bg-000 text-left text-text-000 shadow-none transition-colors hover:bg-bg-200 active:bg-bg-300 focus-visible:keyboard-focus disabled:cursor-not-allowed disabled:opacity-50'
export const artifactGalleryClassName =
  'grid max-w-full grid-cols-[repeat(auto-fill,128px)] gap-2 pb-1'

// Shared presentation only; each owner supplies its live or archived preview and navigation.
// Actions are siblings of the card button, never children: a button inside a button is invalid HTML
// and would break both the preview click target and keyboard traversal (#122).
export function GeneratedFileCard({
  name,
  sizeLabel,
  label,
  title,
  preview,
  disabled,
  buttonRef,
  onClick,
  actions,
  statusLabel
}: {
  name: string
  sizeLabel?: string
  label: string
  title?: string
  preview: ReactNode
  disabled?: boolean
  buttonRef?: Ref<HTMLButtonElement>
  onClick: React.MouseEventHandler<HTMLButtonElement>
  actions?: ReactNode
  statusLabel?: string
}): React.JSX.Element {
  return (
    <div className="group relative min-w-0">
      <button
        ref={buttonRef}
        type="button"
        className={cn('flex min-w-0 flex-col', artifactCardClassName)}
        disabled={disabled}
        onClick={onClick}
        aria-label={label}
        title={title}
      >
        <div className="relative h-[56px] w-full overflow-hidden bg-bg-200">
          {preview}
          {actions ? null : (
            <span
              data-slot="generated-artifact-open-icon"
              className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-md bg-bg-000/90 text-text-100 opacity-0 shadow-sm transition-[opacity,background-color,color] duration-150 hover:bg-bg-300 hover:text-text-000 group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none"
              aria-hidden="true"
            >
              <ArrowUpRight className="size-4" strokeWidth={1.75} />
            </span>
          )}
          {statusLabel ? (
            <span
              data-slot="generated-artifact-status"
              className="absolute bottom-1 left-1 rounded bg-text-000/75 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-bg-000 shadow-sm"
            >
              {statusLabel}
            </span>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-1 items-center px-1.5">
          <ExtensionPreservingFileName
            name={name}
            className="flex-1 text-[12px] leading-5"
            compact
          />
          {sizeLabel ? (
            <span className="ml-1 shrink-0 text-[11px] text-text-000">{sizeLabel}</span>
          ) : null}
        </div>
      </button>
      {actions ? (
        // Hover and keyboard focus both reveal the actions; on touch there is no hover, so the
        // "more" menu stays reachable through the card's own preview button.
        <div
          data-slot="generated-artifact-actions"
          className="absolute right-1 top-1 flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none"
        >
          {actions}
        </div>
      ) : null}
    </div>
  )
}
