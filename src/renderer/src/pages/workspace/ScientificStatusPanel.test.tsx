// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it } from 'vitest'
import { initI18n } from '../../i18n'
import { scientificStatusKey } from '../../../../shared/scientific-status'
import { ScientificStatusPanel } from './ScientificStatusPanel'

afterEach(() => {
  window.localStorage.clear()
  initI18n('en')
})
const change = async (
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string
): Promise<void> => {
  const prototype =
    element.tagName === 'SELECT'
      ? HTMLSelectElement.prototype
      : element.tagName === 'TEXTAREA'
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value)
    element.dispatchEvent(
      new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })
    )
  })
}
it('blocks computed status without checked evidence and preserves edits until a valid save', async () => {
  const host = document.createElement('div')
  const root = createRoot(host)
  try {
    await act(async () => root.render(<ScientificStatusPanel projectId="a" />))
    await act(async () => host.querySelector<HTMLButtonElement>('button')!.click())
    await change(host.querySelector('select')!, 'computed')
    const save = (): HTMLButtonElement =>
      Array.from(host.querySelectorAll('button')).find((b) => b.textContent === 'Save')!
    await act(async () => save().click())
    expect(host.textContent).toContain('Provide a title')
    expect(window.localStorage.getItem(scientificStatusKey('a'))).toBeNull()
    await change(host.querySelector('textarea')!, 'Run 42 / result.csv / input v1')
    await act(async () => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click())
    await act(async () => save().click())
    expect(JSON.parse(window.localStorage.getItem(scientificStatusKey('a'))!).items[0].status).toBe(
      'computed'
    )
    expect(host.querySelector('select')).toBeNull()
    await act(async () => root.render(<ScientificStatusPanel key="b" projectId="b" />))
    expect(host.textContent).not.toContain('Run 42')
  } finally {
    await act(async () => root.unmount())
  }
})
it('shows data blockers after reload and does not allow archived projects to edit', async () => {
  window.localStorage.setItem(
    scientificStatusKey('a'),
    JSON.stringify({
      version: 1,
      projectId: 'a',
      updatedAt: 1,
      items: [
        {
          id: 'x',
          title: 'PFS',
          status: 'data-blocked',
          evidence: '',
          dataCondition: 'No follow-up dates',
          nextStep: 'Confirm dictionary',
          outputsChecked: false
        }
      ]
    })
  )
  const host = document.createElement('div')
  const root = createRoot(host)
  try {
    await act(async () => root.render(<ScientificStatusPanel projectId="a" readOnly />))
    expect(host.textContent).toContain('No follow-up dates')
    expect(host.textContent).toContain('Confirm dictionary')
    expect(host.querySelector<HTMLButtonElement>('button')!.disabled).toBe(true)
  } finally {
    await act(async () => root.unmount())
  }
})
it('shows invalid storage without overwriting it and translates Japanese state labels', async () => {
  initI18n('ja')
  window.localStorage.setItem(scientificStatusKey('a'), '{broken')
  const host = document.createElement('div')
  const root = createRoot(host)
  try {
    await act(async () => root.render(<ScientificStatusPanel projectId="a" />))
    expect(host.textContent).toContain('研究の状態')
    expect(host.textContent).toContain('既存の記録は上書きしません')
    expect(host.querySelector<HTMLButtonElement>('button')!.disabled).toBe(true)
    expect(window.localStorage.getItem(scientificStatusKey('a'))).toBe('{broken')
  } finally {
    await act(async () => root.unmount())
  }
})
