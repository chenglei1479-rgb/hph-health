// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { usePackageOperationStore } from '@/stores/package-operation-store'
import type { PackageSelectableFile } from '../../../shared/session-package'

import { PackageFileSelection } from './PackageFileSelection'

const selectableFile = (overrides: Partial<PackageSelectableFile> = {}): PackageSelectableFile => ({
  storageKey: 'artifacts/project-1/session-1/artifact-1/version-1/content',
  filename: 'plot.png',
  sizeBytes: 1024,
  groupId: 'artifact-1',
  source: 'artifact',
  versionNumber: 1,
  dependentFiles: [],
  ...overrides
})

describe('PackageFileSelection', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    usePackageOperationStore.setState({
      operation: null,
      excludedStorageKeys: [],
      selectionPreset: 'full',
      preselect: null,
      open: true
    })
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  // The preset a checkbox writes is what makes a preselected file stick as an initial value: the
  // next snapshot only keeps a draft when the reader moved off the preset themselves.
  it('records a manual checkbox change as a custom selection', async () => {
    const file = selectableFile()

    await act(async () => {
      root.render(
        <PackageFileSelection
          files={[file]}
          onSelect={vi.fn()}
          onCancel={vi.fn()}
          summary={{ retainedFiles: [], metadataBytes: 0 }}
        />
      )
    })

    // Opening the customization panel is what exposes the per-file checkboxes.
    const customize = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Customize contents')
    )
    await act(async () => {
      customize?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const checkbox = container.querySelector<HTMLElement>(`[aria-label="${file.filename}"]`)
    expect(checkbox).not.toBeNull()
    expect(checkbox?.getAttribute('aria-checked')).toBe('true')

    await act(async () => {
      checkbox?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })

    const state = usePackageOperationStore.getState()
    expect(state.excludedStorageKeys).toContain(file.storageKey)
    expect(state.selectionPreset).toBe('custom')
  })
})
