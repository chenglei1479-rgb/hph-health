// @vitest-environment jsdom

import { readFileSync } from 'node:fs'

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it } from 'vitest'

import { initI18n } from '@/i18n'
import { useLocaleStore } from '@/stores/locale-store'
import { SampleAbstractDialog } from './SampleAbstractDialog'

const JA_LINE = '架空のデータによるデモです。実在の患者・研究結果ではありません'

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  useLocaleStore.setState({ preference: 'en', locale: 'en' })
  initI18n('en')
})

it('shows the fictional abstract without a model call and keeps the Japanese line on ja', async () => {
  initI18n('zh-Hans')
  useLocaleStore.setState({ preference: 'zh-Hans', locale: 'zh-Hans' })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(<SampleAbstractDialog open onClose={() => undefined} />)
  })
  const pages = container.querySelectorAll('[data-testid="sample-abstract-page"]')
  expect(pages).toHaveLength(3)
  for (const page of pages) {
    const title = page.querySelector('h3')
    const disclaimer = page.querySelector('[data-testid="sample-abstract-disclaimer"]')
    const footer = page.querySelector('[data-testid="sample-abstract-footer"]')
    expect(title).toBeTruthy()
    expect(disclaimer?.textContent).toContain('并非真实患者或研究结果')
    expect(footer?.textContent).toContain('并非真实患者或研究结果')
    expect(footer?.textContent).toContain('ベースリオ デモ')
    expect(page.textContent).not.toContain(JA_LINE)
  }

  initI18n('ja')
  useLocaleStore.setState({ preference: 'ja', locale: 'ja' })
  await act(async () => {
    root?.render(<SampleAbstractDialog open onClose={() => undefined} />)
  })
  expect(container.textContent).toContain(JA_LINE)
  expect(container.textContent?.split(JA_LINE).length).toBe(7)
  expect(container.querySelectorAll('[data-testid="sample-abstract-footer"]')).toHaveLength(3)

  const source = readFileSync('src/renderer/src/pages/home/SampleAbstractDialog.tsx', 'utf8')
  expect(source).not.toMatch(/fetch\(|window\.api|https?:\/\//)
})
