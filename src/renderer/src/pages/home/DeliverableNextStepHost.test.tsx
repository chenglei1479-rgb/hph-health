// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it } from 'vitest'

import { initI18n } from '../../i18n'
import { createInitialProjectState, useProjectStore } from '@/stores/project-store'
import { WORKFLOW_MODE_ANALYSIS_LINE } from '../../../../shared/deliverable-next-step'
import { DeliverableNextStepHost } from './DeliverableNextStepHost'

let root: Root | null = null
let host: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  useProjectStore.setState(createInitialProjectState())
  initI18n('en')
})

const renderHost = async (agentContext: string): Promise<void> => {
  useProjectStore.setState({
    ...createInitialProjectState(),
    projects: [
      {
        id: 'project-1',
        name: 'Study',
        description: '',
        isExample: false,
        agentContext,
        createdAt: 1,
        updatedAt: 1
      }
    ],
    isLoaded: true
  })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root?.render(
      <DeliverableNextStepHost
        session={{
          id: 'session-1',
          status: 'running',
          projectId: 'project-1',
          messages: []
        }}
      />
    )
  })
}

it('opens aggregate statistics export from an analysis project and not from mentor prep', async () => {
  initI18n('en')
  await renderHost(WORKFLOW_MODE_ANALYSIS_LINE)
  const button = document.body.querySelector<HTMLButtonElement>(
    '[data-testid="export-statistician-package"]'
  )
  expect(button?.textContent).toContain('Aggregate statistics export')
  expect(
    document.body.querySelector('[data-testid="statistician-export-subtitle"]')?.textContent
  ).toBe('Aggregated results only; source data is not included')
  await act(async () => {
    button?.click()
  })
  expect(document.body.querySelector('[data-testid="statistician-export-dialog"]')).not.toBeNull()
  expect(document.body.querySelector('[data-testid="export-raw-data"]')).toBeNull()
  expect(document.body.textContent).not.toContain('個体データ')

  await act(async () => root?.unmount())
  host?.remove()
  await renderHost('Package mode: mentor-pack')
  expect(document.body.querySelector('[data-testid="export-statistician-package"]')).toBeNull()
})
