// @vitest-environment jsdom
// Pins the generated-file card's last-jump actions (#122): a download action and a "more" menu on the
// message gallery, plus the versioned default filename that every entry point shares.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { JSX, PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TooltipProvider } from '@/components/ui/tooltip'
import type { ChatMessage } from '@/stores/session-store'

import { WorkspaceMessageItem as MessageItem } from './WorkspaceMessageItem'
import { versionedArtifactDownloadName } from './artifact-download-name'

const WorkspaceMessageItem = (
  props: React.ComponentProps<typeof MessageItem>
): React.JSX.Element => (
  <TooltipProvider delayDuration={200}>
    <MessageItem {...props} />
  </TooltipProvider>
)

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@/components/ui/message-scroller', () => ({
  MessageScrollerItem: ({ children }: PropsWithChildren): JSX.Element => <div>{children}</div>
}))

vi.mock('@/components/streamdown/AgentMarkdown', () => ({
  AgentMarkdown: ({ content }: { content: string }) => <div>{content}</div>,
  PresentedAgentMarkdown: ({ content }: { content: string }) => <div>{content}</div>
}))

vi.mock('./artifact-preview', () => ({
  ArtifactPreview: () => <div data-testid="artifact-preview" />
}))

const saveManagedFile = vi.fn(async () => ({ saved: false }))

let container: HTMLDivElement
let root: Root

const originalResizeObserver = globalThis.ResizeObserver

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      disconnect(): void {}
      unobserve(): void {}
    }
  )
  ;(window as unknown as { api: unknown }).api = {
    saveManagedFile,
    // The card probes for a missing backing file once it is near the viewport; "ok" keeps it available.
    artifacts: { readPreview: vi.fn(async () => ({ ok: true, format: 'image', data: '' })) }
  }
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  if (originalResizeObserver) globalThis.ResizeObserver = originalResizeObserver
})

const artifact = (versionNumber: number) => ({
  id: `artifact-${versionNumber}`,
  kind: 'managed-file' as const,
  name: 'plot.png',
  mimeType: 'image/png',
  path: `C:/data/plot.png`,
  size: 12_779,
  mtimeMs: 1_790_000_000_000,
  createdAt: 1_790_000_000_000,
  artifactId: 'artifact-1',
  versionId: `version-${versionNumber}`,
  versionNumber,
  // A version id without `isPublished` means "still publishing", which disables the card actions.
  isPublished: true,
  // The scroller resolves these before the card sees the artifact; the download needs both.
  resolvedProjectId: 'project-1',
  resolvedSessionId: 'session-1',
  sha256: 'a'.repeat(64)
})

const message = (): ChatMessage => ({
  id: 'message-1',
  role: 'agent',
  content: 'Done.',
  status: 'complete',
  eventIds: [],
  createdAt: 1_790_000_000_000,
  updatedAt: 1_790_000_000_000
})

const render = async (overrides: {
  artifacts: unknown[]
  onOpenArtifactDetails?: (value: unknown) => void
}): Promise<{ preview: ReturnType<typeof vi.fn>; details: ReturnType<typeof vi.fn> }> => {
  const preview = vi.fn()
  const details = vi.fn()
  await act(async () => {
    root.render(
      <WorkspaceMessageItem
        message={message()}
        projectId="project-1"
        artifacts={overrides.artifacts as React.ComponentProps<typeof MessageItem>['artifacts']}
        onPreviewArtifact={preview}
        onOpenArtifactDetails={overrides.onOpenArtifactDetails ?? details}
        onPreviewUploadAttachment={vi.fn()}
        onOpenSkillMention={vi.fn()}
        onPreviewMentionArtifact={vi.fn()}
      />
    )
  })
  return { preview, details }
}

const menuTrigger = (name: string): HTMLButtonElement | null =>
  container.querySelector(`button[aria-label="More actions for ${name}"]`)

const click = async (element: Element | null): Promise<void> => {
  await act(async () => {
    element?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

// Radix opens a menu on pointerdown, not click; a synthetic click alone leaves it closed.
const openMenu = async (element: Element | null): Promise<void> => {
  await act(async () => {
    element?.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, button: 0, ctrlKey: false })
    )
  })
}

const menuItems = (): HTMLElement[] =>
  Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'))

describe('generated file card actions', () => {
  it('keeps the generated badge and adds a download action beside the preview', async () => {
    const { preview } = await render({ artifacts: [artifact(1)] })

    const actions = container.querySelector('[data-slot="generated-artifact-actions"]')
    expect(actions).not.toBeNull()
    // Version 1 keeps the plain filename in the save dialog.
    const downloadButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Download plot.png"]'
    )
    expect(downloadButton).not.toBeNull()

    // The card face still previews on click, and the action buttons stay outside it (no nested buttons).
    const face = container.querySelector<HTMLButtonElement>('button[title="C:/data/plot.png"]')
    expect(face).not.toBeNull()
    expect(face?.querySelector('button')).toBeNull()
    await click(face)
    expect(preview).toHaveBeenCalledOnce()
  })

  it('offers preview, download, and file details from the more menu', async () => {
    const { preview, details } = await render({ artifacts: [artifact(2)] })
    const target = artifact(2)

    await openMenu(menuTrigger('plot.png'))
    const items = menuItems()
    expect(items).toHaveLength(3)
    // The version suffix is what the save dialog receives; assert the name, not the localized copy.
    expect(items[1]?.textContent).toContain('plot-v2.png')
    expect(items[2]?.textContent).toBe('File details')

    await click(items[1]!)
    expect(saveManagedFile).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'artifact', suggestedName: 'plot-v2.png' })
    )

    await openMenu(menuTrigger('plot.png'))
    await click(menuItems()[0] ?? null)
    expect(preview).toHaveBeenCalledWith(expect.objectContaining({ id: target.id }))

    await openMenu(menuTrigger('plot.png'))
    await click(menuItems()[2] ?? null)
    expect(details).toHaveBeenCalledWith(expect.objectContaining({ id: target.id }))
  })

  it('hides the details action when the surface has no workbench to open', async () => {
    const preview = vi.fn()
    await act(async () => {
      root.render(
        <WorkspaceMessageItem
          message={message()}
          projectId="project-1"
          artifacts={[artifact(1)] as React.ComponentProps<typeof MessageItem>['artifacts']}
          onPreviewArtifact={preview}
          onPreviewUploadAttachment={vi.fn()}
          onOpenSkillMention={vi.fn()}
          onPreviewMentionArtifact={vi.fn()}
        />
      )
    })

    await openMenu(menuTrigger('plot.png'))
    const labels = menuItems().map((item) => item.textContent)
    expect(labels).not.toContain('File details')
    expect(labels).toHaveLength(2)
  })
})

describe('versionedArtifactDownloadName', () => {
  it.each([
    ['plot.png', undefined, 'plot.png'],
    ['plot.png', 1, 'plot.png'],
    ['plot.png', 2, 'plot-v2.png'],
    ['plot.png', 12, 'plot-v12.png'],
    ['report.final.pdf', 3, 'report.final-v3.pdf'],
    ['LICENSE', 2, 'LICENSE-v2'],
    ['.env', 2, '.env-v2']
  ])('names %s at version %s as %s', (name, version, expected) => {
    expect(versionedArtifactDownloadName(name, version)).toBe(expected)
  })
})
