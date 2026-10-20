// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  AgentFrameworkId,
  ClaudeInstallResult,
  EnvironmentCheckResult
} from '../../../../shared/settings'
import { useSettingsStore } from '@/stores/settings-store'
import { AgentBootstrapStep } from './AgentBootstrapStep'
import {
  clickButton,
  environment,
  resetOnboardingStores,
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

const codexEnvironment = (ready: boolean, canAutoInstall = false): EnvironmentCheckResult => ({
  ...environment(ready),
  agentFrameworkId: 'codex',
  canAutoInstall,
  runtime: ready ? { found: true, path: '/bin/codex' } : { found: false }
})

const claudeEnvironment = (ready: boolean, canAutoInstall = false): EnvironmentCheckResult => ({
  ...environment(ready),
  agentFrameworkId: 'claude-code',
  canAutoInstall
})

const installResult = (ok = true): ClaudeInstallResult => ({ installId: 'codex-1', ok })

const renderStep = async (onContinue = vi.fn()): Promise<void> => {
  await act(async () => {
    root.render(<AgentBootstrapStep onContinue={onContinue} />)
  })
  await act(async () => {
    await Promise.resolve()
  })
}

describe('AgentBootstrapStep runtime policy', () => {
  it('pins Codex on a fresh install, installs it, and auto-advances', async () => {
    const onContinue = vi.fn()
    const installCodex = vi.fn(async () => installResult())
    let checks = 0
    const checkEnvironment = vi.fn(async () => {
      checks += 1
      const next = checks === 1 ? codexEnvironment(false, true) : codexEnvironment(true)
      useSettingsStore.setState({ environmentCheck: next, isCheckingEnvironment: false })
      return next
    })
    const setAgentFramework = vi.fn(async (id: AgentFrameworkId) => {
      useSettingsStore.setState({
        agentFrameworkId: id,
        agentFrameworkSelected: true,
        environmentCheck: codexEnvironment(false, true)
      })
    })
    useSettingsStore.setState({
      agentFrameworkId: 'claude-code',
      agentFrameworkSelected: false,
      environmentCheck: claudeEnvironment(true),
      installCodex,
      checkEnvironment,
      setAgentFramework
    })

    await renderStep(onContinue)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(setAgentFramework).toHaveBeenCalledWith('codex')
    expect(installCodex).toHaveBeenCalledOnce()
    expect(onContinue).toHaveBeenCalled()
  })

  it('keeps a stored Claude Code runtime on reopen and never installs Codex', async () => {
    const onContinue = vi.fn()
    const setAgentFramework = vi.fn()
    const installCodex = vi.fn()
    useSettingsStore.setState({
      agentFrameworkId: 'claude-code',
      agentFrameworkSelected: true,
      environmentCheck: claudeEnvironment(true),
      installCodex,
      setAgentFramework
    })

    await renderStep(onContinue)

    expect(setAgentFramework).not.toHaveBeenCalled()
    expect(installCodex).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Verify the agent runtime')
    expect(container.textContent).toContain('The existing runtime is ready.')
    await clickButton(/^continue$/i)
    expect(onContinue).toHaveBeenCalledOnce()
  })

  it('auto-advances a stored Codex runtime without reinstalling it', async () => {
    const onContinue = vi.fn()
    const setAgentFramework = vi.fn()
    const installCodex = vi.fn()
    useSettingsStore.setState({
      agentFrameworkId: 'codex',
      agentFrameworkSelected: true,
      environmentCheck: codexEnvironment(true),
      installCodex,
      setAgentFramework
    })

    await renderStep(onContinue)

    expect(setAgentFramework).not.toHaveBeenCalled()
    expect(installCodex).not.toHaveBeenCalled()
    expect(onContinue).toHaveBeenCalledOnce()
  })

  it('treats an impossible auto-install as a failure with a way forward', async () => {
    useSettingsStore.setState({
      agentFrameworkId: 'codex',
      agentFrameworkSelected: true,
      environmentCheck: {
        ...codexEnvironment(false, false),
        checks: [
          {
            id: 'install-network',
            label: 'Installation network',
            status: 'failed',
            summary: 'The official npm registry is not reachable.'
          }
        ]
      }
    })

    await renderStep()

    expect(container.textContent).toContain('The official npm registry is not reachable.')
    expect(container.textContent).toContain('You can retry')
    expect(
      Array.from(container.querySelectorAll('button')).some((button) =>
        /^check again$/i.test(button.textContent ?? '')
      )
    ).toBe(true)
    expect(
      Array.from(container.querySelectorAll('button')).some((button) =>
        /^continue anyway$/i.test(button.textContent ?? '')
      )
    ).toBe(true)
  })

  it('lets a reopened non-Codex runtime continue when its check is failing', async () => {
    const onContinue = vi.fn()
    const installCodex = vi.fn()
    useSettingsStore.setState({
      agentFrameworkId: 'claude-code',
      agentFrameworkSelected: true,
      environmentCheck: claudeEnvironment(false, false),
      installCodex
    })

    await renderStep(onContinue)

    expect(installCodex).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Claude is not installed yet.')
    await clickButton(/^continue anyway$/i)
    expect(onContinue).toHaveBeenCalledOnce()
  })
})
