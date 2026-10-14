// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { i18next } from '@/i18n'
import { MachineApprovalSection } from './MachineApprovalSection'

let container: HTMLDivElement
let root: Root
let getStatus: ReturnType<typeof vi.fn>
let setStatus: ReturnType<typeof vi.fn>

const flush = async (): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

beforeEach(() => {
  act(() => {
    void i18next.changeLanguage('en')
  })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  getStatus = vi.fn().mockResolvedValue({ approved: false, approvalNumber: null, at: null })
  setStatus = vi.fn()
  ;(window as unknown as { api: unknown }).api = { machineApproval: { getStatus, setStatus } }
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('MachineApprovalSection', () => {
  it('approves with the entered number and revokes by appending a later choice', async () => {
    await act(async () => {
      root.render(<MachineApprovalSection />)
    })
    await flush()
    expect(container.textContent).toContain('This machine is not approved.')
    const approve = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Approve this machine')
    ) as HTMLButtonElement
    expect(approve.disabled).toBe(true)

    const input = container.querySelector('input') as HTMLInputElement
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    await act(async () => {
      setValue?.call(input, '  HP-2026-014  ')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(approve.disabled).toBe(false)

    setStatus.mockResolvedValue({
      approved: true,
      approvalNumber: 'HP-2026-014',
      at: '2026-10-14T04:00:00.000Z'
    })
    await act(async () => {
      approve.click()
    })
    await flush()
    expect(setStatus).toHaveBeenCalledWith({ approved: true, approvalNumber: 'HP-2026-014' })
    expect(container.textContent).toContain('Approved under HP-2026-014.')
    expect(container.textContent).toContain('2026-10-14T04:00:00.000Z')

    const revoke = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Revoke approval')
    ) as HTMLButtonElement
    setStatus.mockResolvedValue({
      approved: false,
      approvalNumber: null,
      at: '2026-10-14T05:00:00.000Z'
    })
    await act(async () => {
      revoke.click()
    })
    await flush()
    expect(setStatus).toHaveBeenLastCalledWith({ approved: false })
    expect(container.textContent).toContain('This machine is not approved.')
  })

  it('does not send a blank approval number', async () => {
    await act(async () => {
      root.render(<MachineApprovalSection />)
    })
    await flush()
    const input = container.querySelector('input') as HTMLInputElement
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    await act(async () => {
      setValue?.call(input, '   ')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const approve = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Approve this machine')
    ) as HTMLButtonElement
    expect(approve.disabled).toBe(true)
    expect(setStatus).not.toHaveBeenCalled()
    expect(container.textContent).not.toContain('Approved under')
  })
})
