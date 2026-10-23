// @vitest-environment jsdom
// Shell-level onboarding flow: the beta-terms gate, the silent environment skip, the fixed Codex
// runtime step, the location default, and the shell-owned relaunch/recovery states. Per-step details
// stay in the step suites.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useSettingsStore } from '@/stores/settings-store'
import { OnboardingWizard } from './OnboardingWizard'
import {
  clickButton,
  codexReadyState,
  DEFAULT_DATA_ROOT,
  environment,
  findButton,
  readyClaudeState,
  resetOnboardingStores,
  storageInfo,
  stubWindowApi
} from './onboarding-test-utils'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  resetOnboardingStores()
  stubWindowApi()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.body.innerHTML = ''
  delete (window as unknown as { api?: unknown }).api
})

const renderWizard = async (): Promise<void> => {
  await act(async () => {
    root.render(<OnboardingWizard />)
  })
}

const section = (label: string): Element | null =>
  container.querySelector(`section[aria-label="${label}"]`)

const progressItems = (): string[] =>
  Array.from(container.querySelectorAll('ol[aria-label="Setup progress"] li')).map(
    (item) => item.textContent ?? ''
  )

const acceptTerms = async (): Promise<void> => {
  const input = container.querySelector<HTMLInputElement>('input[type="checkbox"]')
  await act(async () => {
    input?.click()
  })
  await clickButton(/agree and continue/i)
}

describe('OnboardingWizard flow', () => {
  it('uses a single-column layout before the desktop breakpoint', async () => {
    readyClaudeState()
    await renderWizard()

    const layout = container.querySelector<HTMLElement>('[data-onboarding-layout="split"]')
    expect(layout?.className).toContain('grid-cols-1')
    expect(layout?.className).toContain('md:grid-cols-[240px_minmax(0,1fr)]')
  })

  it('starts on the beta terms with five visible steps and no pre-checked consent', async () => {
    useSettingsStore.setState({ betaTermsAcceptance: undefined })
    await renderWizard()

    expect(progressItems()).toEqual([
      '1Beta terms of use',
      '2Environment',
      '3Data location',
      '4Agent runtime',
      '5Model provider'
    ])
    const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]')
    expect(checkbox?.checked).toBe(false)
    expect(findButton(/agree and continue/i)?.disabled).toBe(true)
  })

  it('records acceptance and continues in three deliberate actions', async () => {
    useSettingsStore.setState({ betaTermsAcceptance: undefined })
    useSettingsStore.setState(codexReadyState())
    await renderWizard()

    await acceptTerms()
    expect(useSettingsStore.getState().acceptBetaTerms).toHaveBeenCalledOnce()
    expect(section('Choose data location')).not.toBeNull()

    await clickButton(/continue with this location/i)
    // Codex is already ready, so the runtime step advances without a click.
    expect(section('Configure model')).not.toBeNull()

    await clickButton(/set up later/i)
    expect(useSettingsStore.getState().completeOnboarding).toHaveBeenCalledOnce()
  })

  it('silently skips a passing environment preflight', async () => {
    useSettingsStore.setState(codexReadyState())
    await renderWizard()

    expect(section('Prepare environment')).toBeNull()
    expect(section('Choose data location')).not.toBeNull()
    expect(progressItems()[1]).toBe('Environment')
  })

  it('shows the environment step when a required host check fails', async () => {
    useSettingsStore.setState({
      environmentCheck: {
        ...environment(false),
        checks: [
          {
            id: 'storage',
            label: 'App storage permission',
            status: 'failed',
            summary: 'The data folder is not writable.'
          }
        ]
      }
    })
    await renderWizard()

    expect(section('Prepare environment')).not.toBeNull()
    expect(findButton(/^continue$/i)?.disabled).toBe(true)
  })

  it('keeps the home MedResearch-Agent default on Windows instead of recommending another drive', async () => {
    window.api.platform = 'win32'
    window.api.storage.getInfo = vi.fn().mockResolvedValue(
      storageInfo({
        dataRoot: 'C:\\Users\\researcher\\MedResearch-Agent',
        defaultDataRoot: 'C:\\Users\\researcher\\MedResearch-Agent',
        defaultParent: 'C:\\Users\\researcher',
        canAutoSelectDataDrive: true
      })
    )
    window.api.localFs.listDrives = vi.fn().mockResolvedValue([
      { path: 'C:\\', label: 'C:' },
      { path: 'D:\\', label: 'D:' },
      { path: 'E:\\', label: 'E:' }
    ])
    useSettingsStore.setState(codexReadyState())
    await renderWizard()

    expect(section('Choose data location')).not.toBeNull()
    expect(container.textContent).toContain('C:\\Users\\researcher\\MedResearch-Agent')
    expect(window.api.localFs.listDrives).not.toHaveBeenCalled()
    expect(window.api.storage.inspectDataRoot).not.toHaveBeenCalled()
  })

  it('shows the full data path and a copy control', async () => {
    useSettingsStore.setState(codexReadyState())
    await renderWizard()

    const path = container.querySelector('[aria-label="Data location path"]')
    expect(path?.textContent).toBe(DEFAULT_DATA_ROOT)
    expect(path?.className).toContain('break-all')
    expect(findButton(/copy path/i)).not.toBeNull()
  })

  it('resumes at the fixed runtime after a custom data root was persisted', async () => {
    window.api.storage.getInfo = vi.fn().mockResolvedValue(
      storageInfo({
        dataRoot: '/mnt/data/MedResearch-Agent',
        isDefault: false,
        defaultDataRoot: DEFAULT_DATA_ROOT
      })
    )
    useSettingsStore.setState(codexReadyState())
    await renderWizard()

    expect(section('Choose data location')).toBeNull()
    expect(section('Configure model')).not.toBeNull()
  })

  it('keeps a missing custom data root in the recoverable location step', async () => {
    window.api.storage.getInfo = vi.fn().mockResolvedValue(
      storageInfo({
        dataRoot: '/mnt/removed/MedResearch-Agent',
        isDefault: false,
        dataRootMissing: true
      })
    )
    useSettingsStore.setState(codexReadyState())
    await renderWizard()

    expect(section('Choose data location')).not.toBeNull()
    expect(container.textContent).toContain('/mnt/removed/MedResearch-Agent')
  })

  it('waits for storage information before allowing Continue', async () => {
    window.api.storage.getInfo = vi.fn().mockReturnValue(new Promise(() => undefined))
    useSettingsStore.setState(codexReadyState())
    await renderWizard()

    expect(findButton(/continue with this location/i)?.disabled).toBe(true)
  })

  it('walks Back from Location to the terms review and forward again', async () => {
    useSettingsStore.setState(codexReadyState())
    await renderWizard()
    expect(section('Choose data location')).not.toBeNull()

    await clickButton(/^back$/i)
    expect(container.textContent).toContain('Beta terms of use')

    const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]')
    expect(checkbox?.checked).toBe(false)
    await act(async () => {
      checkbox?.click()
    })
    await clickButton(/agree and continue/i)
    expect(section('Choose data location')).not.toBeNull()
  })

  it('keeps a chosen data location after Back and forward navigation', async () => {
    useSettingsStore.setState(codexReadyState())
    window.api.storage.pickDirectory = vi.fn().mockResolvedValue('/mnt/data')
    window.api.storage.inspectDataRoot = vi
      .fn()
      .mockResolvedValue({ kind: 'move', dataRoot: '/mnt/data/MedResearch-Agent' })
    await renderWizard()
    await clickButton(/browse/i)
    expect(container.textContent).toContain('/mnt/data/MedResearch-Agent')

    await clickButton(/^back$/i)
    await acceptTerms()
    expect(container.textContent).toContain('/mnt/data/MedResearch-Agent')
  })

  it('shows a full-screen Setting up state while the relaunch call is in flight', async () => {
    useSettingsStore.setState(codexReadyState())
    window.api.storage.pickDirectory = vi.fn().mockResolvedValue('/mnt/data')
    window.api.storage.inspectDataRoot = vi
      .fn()
      .mockResolvedValue({ kind: 'move', dataRoot: '/mnt/data/MedResearch-Agent' })
    window.api.storage.setDataRootAndRelaunch = vi
      .fn()
      .mockReturnValue(new Promise(() => undefined))
    await renderWizard()
    await clickButton(/browse/i)
    await clickButton(/continue with this location/i)
    await clickButton(/^restart$/i)

    expect(container.textContent).toContain('Setting up your workspace')
  })

  it('keeps onboarding recoverable when loading storage information rejects', async () => {
    window.api.storage.getInfo = vi.fn().mockRejectedValue(new Error('Storage read failed.'))
    useSettingsStore.setState(codexReadyState())
    await renderWizard()

    expect(section('Choose data location')).not.toBeNull()
    expect(container.textContent).toContain('Storage read failed.')
    expect(findButton(/retry/i)).not.toBeNull()
  })

  it('moves focus to the current heading on step changes', async () => {
    useSettingsStore.setState(codexReadyState())
    await renderWizard()

    await clickButton(/^back$/i)
    expect(document.activeElement?.tagName).toBe('H2')
    expect(document.activeElement?.textContent).toContain('Beta terms of use')
  })
})
