// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useNavigationStore } from '@/stores/navigation-store'
import { createInitialSessionState, useSessionStore } from '@/stores/session-store'
import type { ProjectFileItem } from '../../../../shared/project-files'

import { ProjectFileItems } from './project-files-presentation-owner'

const file = (overrides: Partial<ProjectFileItem>): ProjectFileItem => ({
  id: 'file-1',
  source: 'artifact',
  sourceFileId: 'artifact-1',
  sourceVersionId: 'version-1',
  projectId: 'project-1',
  sessionId: 'session-1',
  name: 'plot.png',
  path: 'managed/plot.png',
  size: 1024,
  sortAtMs: 0,
  ...overrides
})

describe('ProjectFileItems research package action', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    useSessionStore.setState({
      ...createInitialSessionState(),
      sessions: [{ id: 'session-1', projectId: 'project-1' }] as never
    })
    useNavigationStore.setState({ view: 'workspace', activeProjectId: 'project-1' })
    window.api = {
      artifacts: { readPreview: vi.fn().mockResolvedValue({ content: '' }) },
      uploads: { readPreview: vi.fn().mockResolvedValue({ content: '' }) },
      saveManagedFile: vi.fn().mockResolvedValue({ saved: false })
    } as unknown as Window['api']
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  const render = async (files: ProjectFileItem[]): Promise<void> => {
    const packageableSessions = new Set(
      useSessionStore
        .getState()
        .sessions.map((session) => `${session.projectId}:${session.id}`)
    )
    await act(async () => {
      root.render(
        <ProjectFileItems
          files={files}
          viewMode="list"
          previewById={new Map()}
          onPreview={() => undefined}
          onOpenInPanel={() => undefined}
          onAddToResearchPackage={() => undefined}
          canAddToResearchPackage={(candidate) =>
            packageableSessions.has(`${candidate.projectId}:${candidate.sessionId}`)
          }
        />
      )
    })
  }

  it('offers the action only for files whose owning Session is loaded', async () => {
    await render([
      file({}),
      file({
        id: 'file-2',
        source: 'upload',
        sourceFileId: 'upload-2',
        sessionId: '.pending',
        name: 'attachment.csv'
      })
    ])

    const rows = container.querySelectorAll('[data-view-mode] > div')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.querySelector('[aria-label="Add to research package"]')).not.toBeNull()
    // An upload that still sits on the pending pseudo-session has no package to join, so the row
    // does not offer an action that could only fail.
    expect(rows[1]?.querySelector('[aria-label="Add to research package"]')).toBeNull()
  })
})
