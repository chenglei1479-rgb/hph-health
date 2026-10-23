// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { StorageLocationRisk } from '../../../../shared/storage'
import { i18next } from '@/i18n'
import { LocationStep } from './LocationStep'
import {
  findButton,
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

afterEach(async () => {
  act(() => root.unmount())
  container.remove()
  document.body.innerHTML = ''
  delete (window as unknown as { api?: unknown }).api
  await i18next.changeLanguage('en')
})

const renderWithRisk = async (risk: StorageLocationRisk): Promise<void> => {
  window.api.storage.getLocationRisk = vi.fn().mockResolvedValue(risk)
  const Harness = (): React.JSX.Element => {
    const [draft, setDraft] = useState({
      chosenDataRoot: '',
      chosenKind: null as 'move' | 'adopt' | null
    })
    const [relaunchError, setRelaunchError] = useState<string | undefined>(undefined)
    return (
      <LocationStep
        dataRootInfo={storageInfo({ dataRoot: '/mnt/data/MedResearch-Agent' })}
        dataRootError={undefined}
        locationDraft={draft}
        onLocationDraftChange={setDraft}
        relaunchError={relaunchError}
        onRelaunchErrorChange={setRelaunchError}
        onRetryDataRootInfo={vi.fn()}
        onInteractionStart={vi.fn()}
        onBack={vi.fn()}
        onContinue={vi.fn()}
        isResolvingDefaultLocation={false}
        setIsRelaunching={vi.fn()}
      />
    )
  }
  await act(async () => {
    root.render(<Harness />)
  })
  await act(async () => {
    await Promise.resolve()
  })
}

describe('LocationStep location warnings', () => {
  it('renders a cloud-sync warning with the provider name', async () => {
    await renderWithRisk({ kind: 'cloud-sync', provider: 'OneDrive' })
    const alert = container.querySelector('[role="status"]')
    expect(alert?.textContent).toContain('cloud-sync folder (OneDrive)')
    expect(alert?.textContent).toContain('Data may be sent to an external server')
    expect(findButton(/continue with this location/i)?.disabled).toBe(false)
  })

  it('renders a removable-drive warning', async () => {
    await renderWithRisk({ kind: 'removable' })
    expect(container.textContent).toContain('This location is on a removable drive.')
    expect(findButton(/continue with this location/i)?.disabled).toBe(false)
  })

  it('renders a network-drive warning', async () => {
    await renderWithRisk({ kind: 'network' })
    expect(container.textContent).toContain('This location is on a network drive.')
    expect(findButton(/continue with this location/i)?.disabled).toBe(false)
  })

  it('renders no warning for a local path', async () => {
    await renderWithRisk({ kind: 'local' })
    expect(container.textContent).not.toContain('This location is on a')
    expect(container.textContent).not.toContain('cloud-sync folder')
  })

  it('treats a failed detection as unknown without blocking or erroring', async () => {
    window.api.storage.getLocationRisk = vi.fn().mockRejectedValue(new Error('probe failed'))
    const Harness = (): React.JSX.Element => {
      const [draft, setDraft] = useState({
        chosenDataRoot: '',
        chosenKind: null as 'move' | 'adopt' | null
      })
      return (
        <LocationStep
          dataRootInfo={storageInfo()}
          dataRootError={undefined}
          locationDraft={draft}
          onLocationDraftChange={setDraft}
          relaunchError={undefined}
          onRelaunchErrorChange={vi.fn()}
          onRetryDataRootInfo={vi.fn()}
          onInteractionStart={vi.fn()}
          onBack={vi.fn()}
          onContinue={vi.fn()}
          isResolvingDefaultLocation={false}
          setIsRelaunching={vi.fn()}
        />
      )
    }
    await act(async () => {
      root.render(<Harness />)
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(findButton(/continue with this location/i)?.disabled).toBe(false)
  })

  it.each([
    ['ja', 'この場所はクラウド同期フォルダー（OneDrive など）の中にあります。'],
    ['zh-Hans', '此位置位于云同步文件夹（如 OneDrive）中。'],
    ['en', 'This location is inside a cloud-sync folder (OneDrive).']
  ])('renders the cloud-sync warning in %s', async (locale, expected) => {
    await act(async () => i18next.changeLanguage(locale))
    await renderWithRisk({ kind: 'cloud-sync', provider: 'OneDrive' })
    expect(container.textContent).toContain(expected)
  })
})
