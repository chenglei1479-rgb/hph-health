// @vitest-environment jsdom
// Navigation and identity regressions for the beta wizard: the runtime is pinned to Codex, and the
// provider draft survives Back/re-render without attaching a stale saved identity to a new draft.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { EnvironmentCheckResult } from '../../../../shared/settings'
import { i18next } from '@/i18n'
import { useSettingsStore } from '@/stores/settings-store'
import { OnboardingWizard } from './OnboardingWizard'
import {
  clickButton,
  codexReadyState,
  fillRequiredProviderFields,
  findButton,
  resetOnboardingStores,
  selectOption,
  stubWindowApi
} from './onboarding-test-utils'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  resetOnboardingStores()
  stubWindowApi()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  act(() => root.unmount())
  container.remove()
  document.body.innerHTML = ''
  delete (window as unknown as { api?: unknown }).api
  await i18next.changeLanguage('en')
})

const renderWizard = async (): Promise<void> => {
  await act(async () => root.render(<OnboardingWizard />))
}

const section = (label: string): Element | null =>
  container.querySelector(`section[aria-label="${label}"]`)

const goToLocation = async (): Promise<void> => {
  useSettingsStore.setState(codexReadyState())
  await renderWizard()
  expect(section('Choose data location')).not.toBeNull()
}

const goToProvider = async (): Promise<void> => {
  await goToLocation()
  await clickButton(/^continue with this location$/i)
  expect(section('Configure model')).not.toBeNull()
  await fillRequiredProviderFields(container)
}

const checkEnvironment = (result: EnvironmentCheckResult): void => {
  useSettingsStore.setState({
    agentFrameworkId: 'codex',
    environmentCheck: result
  })
}

describe('Beta runtime is pinned to Codex', () => {
  it('installs Codex instead of choosing an installed alternative', async () => {
    useSettingsStore.setState({
      agentFrameworkId: 'codex',
      environmentCheck: {
        ...codexReadyState().environmentCheck!,
        ready: false,
        canAutoInstall: true,
        runtime: { found: false }
      }
    })
    await renderWizard()
    await clickButton(/^continue with this location$/i)

    expect(useSettingsStore.getState().installCodex).toHaveBeenCalled()
  })

  it('does not show a runtime chooser', async () => {
    useSettingsStore.setState(codexReadyState())
    await renderWizard()
    await clickButton(/^continue with this location$/i)

    expect(section('Set up the agent runtime')).toBeNull()
    expect(section('Configure model')).not.toBeNull()
  })

  it('shows a repair surface when Codex installation fails', async () => {
    useSettingsStore.setState({
      agentFrameworkId: 'codex',
      environmentCheck: {
        ...codexReadyState().environmentCheck!,
        ready: false,
        canAutoInstall: true,
        runtime: { found: false }
      },
      installStates: {
        ...useSettingsStore.getState().installStates,
        codex: {
          isInstalling: false,
          installLogs: [],
          installProgress: null,
          installError: 'Download failed.'
        }
      }
    })
    await renderWizard()
    await clickButton(/^continue with this location$/i)

    expect(container.textContent).toContain('Download failed.')
    expect(findButton(/continue anyway/i)).not.toBeNull()
  })

  it('keeps setup blocked when a required host check fails', async () => {
    checkEnvironment({
      ...codexReadyState().environmentCheck!,
      ready: false,
      checks: [
        {
          id: 'storage',
          label: 'App storage permission',
          status: 'failed',
          summary: 'The data folder is not writable.'
        }
      ]
    })
    await renderWizard()

    expect(section('Prepare environment')).not.toBeNull()
    expect(findButton(/^continue$/i)?.disabled).toBe(true)
  })
})

describe('Provider identity across Back and re-renders', () => {
  it('reuses a committed identity after a failed validation', async () => {
    const save = vi.fn().mockResolvedValue({
      providerId: 'saved-1',
      validation: { ok: false, category: 'network' }
    })
    useSettingsStore.setState({ saveAndActivateProvider: save })
    await goToProvider()
    await selectOption('Provider type', 'Custom Gateway')
    await fillRequiredProviderFields(container)
    await clickButton(/test & continue/i)
    expect(section('Configure model')).not.toBeNull()

    await act(async () => {
      fireEvent.change(container.querySelector('#provider-base-url')!, {
        target: { value: 'https://replacement.example' }
      })
    })
    await clickButton(/test & continue/i)
    expect(save.mock.calls[1][0]).toMatchObject({
      id: 'saved-1',
      requireExisting: true,
      baseUrl: 'https://replacement.example'
    })
  })

  it('starts a new identity after changing provider kind', async () => {
    await goToProvider()
    await clickButton(/test & continue/i)

    // Change the provider kind on the still-mounted step; the next save must create a new record.
    await selectOption('Provider type', 'Anthropic')
    await selectOption('Provider type', 'Custom Gateway')
    await fillRequiredProviderFields(container)
    await clickButton(/test & continue/i)
    const save = vi.mocked(useSettingsStore.getState().saveAndActivateProvider)
    expect(save.mock.calls.at(-1)?.[0].id).toBeUndefined()
  })

  it('does not attach a late saved identity to a new draft', async () => {
    const pending = Promise.withResolvers<{
      providerId: string
      validation: { ok: true; category: 'ok' }
    }>()
    const save = vi
      .fn()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue({
        providerId: 'saved-2',
        validation: { ok: true, category: 'ok' }
      })
    useSettingsStore.setState({ saveAndActivateProvider: save })
    await goToProvider()
    await clickButton(/test & continue/i)
    await clickButton(/^back$/i)
    await clickButton(/^continue with this location$/i)
    await selectOption('Provider type', 'Anthropic')
    await selectOption('Provider type', 'Custom Gateway')
    await fillRequiredProviderFields(container)
    await act(async () => {
      pending.resolve({ providerId: 'saved-1', validation: { ok: true, category: 'ok' } })
    })
    expect(section('Configure model')).not.toBeNull()
    await clickButton(/test & continue/i)
    expect(save.mock.calls[1][0].id).toBeUndefined()
  })

  it('starts a new identity only on an explicit retry after the saved provider is gone', async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error('Provider no longer exists.'))
      .mockResolvedValueOnce({ providerId: 'saved-2', validation: { ok: true, category: 'ok' } })
    useSettingsStore.setState({ saveAndActivateProvider: save })
    await goToProvider()
    await clickButton(/test & continue/i)
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Provider no longer exists.'
    )
    await clickButton(/test & continue/i)
    expect(save.mock.calls[1][0].id).toBeUndefined()
  })

  it('localizes an incompatible provider draft', async () => {
    await goToProvider()
    await selectOption('Provider type', 'Custom Gateway')
    await fillRequiredProviderFields(container)
    await act(async () => i18next.changeLanguage('zh-Hans'))
    await act(async () => {
      useSettingsStore.setState({
        agentFrameworkId: 'codex',
        agentFrameworks: [
          {
            id: 'codex',
            displayName: 'Codex',
            supportedApiTypes: ['responses'],
            supportsSkills: true
          }
        ]
      })
    })
    await clickButton(/测试并继续/)

    expect(useSettingsStore.getState().saveAndActivateProvider).not.toHaveBeenCalled()
    const alert = container.querySelector('[role="alert"]')
    expect(alert?.textContent).toContain('Codex')
    expect(alert?.textContent).toMatch(/不兼容/)
  })

  it('finishes setup after a successful provider test without a Notebook or Finish step', async () => {
    await goToProvider()
    await clickButton(/test & continue/i)

    expect(section('Notebook runtime (optional)')).toBeNull()
    expect(findButton(/^finish$/i)).toBeNull()
    expect(useSettingsStore.getState().completeOnboarding).toHaveBeenCalledOnce()
  })

  it('keeps the provider draft when Back returns to Location', async () => {
    await goToProvider()
    await selectOption('Provider type', 'Custom Gateway')
    await fillRequiredProviderFields(container)
    await act(async () => {
      fireEvent.change(container.querySelector('#provider-base-url')!, {
        target: { value: 'https://draft.example' }
      })
    })
    await clickButton(/^back$/i)
    expect(section('Choose data location')).not.toBeNull()
    await clickButton(/^continue with this location$/i)
    expect(container.querySelector<HTMLInputElement>('#provider-base-url')?.value).toBe(
      'https://draft.example'
    )
  })
})
