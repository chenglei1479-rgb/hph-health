// @vitest-environment jsdom

import { readFileSync } from 'node:fs'

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { initI18n } from '@/i18n'
import { useLocaleStore } from '@/stores/locale-store'
import { LOCALES } from '../../../../shared/locale'
import { sampleAbstracts } from '../../../../shared/demo-readmission/sample-abstracts'
import { SampleAbstractDialog } from './SampleAbstractDialog'

const JA_LINE = '架空のデータによるデモです。実在の患者・研究結果ではありません'
const SAVED_COPY = 'Sample saved on this device.'

let root: Root | null = null
let container: HTMLDivElement | null = null
let saveBlobFile: ReturnType<typeof vi.fn>
let previousApi: unknown

beforeEach(() => {
  initI18n('en')
  useLocaleStore.setState({ preference: 'en', locale: 'en' })
  saveBlobFile = vi.fn().mockResolvedValue({ saved: true })
  previousApi = (window as unknown as { api?: unknown }).api
  ;(window as unknown as { api: unknown }).api = { saveBlobFile }
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  ;(window as unknown as { api?: unknown }).api = previousApi
  useLocaleStore.setState({ preference: 'en', locale: 'en' })
  initI18n('en')
})

const renderDialog = async (): Promise<void> => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(<SampleAbstractDialog open onClose={() => undefined} />)
  })
}

const clickSave = async (): Promise<void> => {
  const button = [...(container?.querySelectorAll('button') ?? [])].find(
    (element) => element.textContent === 'Save this sample'
  )
  expect(button).toBeTruthy()
  await act(async () => {
    button?.click()
  })
}

it('does not claim a save when the doctor cancels the Save As dialog', async () => {
  saveBlobFile.mockResolvedValue({ saved: false })
  await renderDialog()

  await clickSave()

  expect(saveBlobFile).toHaveBeenCalledOnce()
  expect(container?.querySelector('[role="status"]')).toBeNull()
  expect(container?.textContent).not.toContain(SAVED_COPY)
  const request = saveBlobFile.mock.calls[0]?.[0] as {
    suggestedName: string
    mimeType: string
    data: ArrayBuffer
  }
  expect(request.suggestedName).toBe('dra-demo-abstract.en.html')
  expect(request.mimeType).toBe('text/html;charset=utf-8')
  expect(new TextDecoder().decode(request.data)).toBe(sampleAbstracts.documents.en.html)
})

it('reports the save once the file was written', async () => {
  await renderDialog()

  await clickSave()

  expect(saveBlobFile).toHaveBeenCalledOnce()
  expect(container?.querySelector('[role="status"]')?.textContent).toBe(SAVED_COPY)
})

it('stays silent when the save fails', async () => {
  saveBlobFile.mockRejectedValue(new Error('EACCES'))
  await renderDialog()

  await clickSave()

  expect(container?.querySelector('[role="status"]')).toBeNull()
})

it('shows the fictional abstract without a model call and keeps the Japanese line on ja', async () => {
  initI18n('zh-Hans')
  useLocaleStore.setState({ preference: 'zh-Hans', locale: 'zh-Hans' })
  await renderDialog()
  const pages = container!.querySelectorAll('[data-testid="sample-abstract-page"]')
  expect(pages).toHaveLength(3)
  for (const page of pages) {
    const title = page.querySelector('h3')
    const disclaimer = page.querySelector('[data-testid="sample-abstract-disclaimer"]')
    const footer = page.querySelector('[data-testid="sample-abstract-footer"]')
    expect(title).toBeTruthy()
    expect(disclaimer?.textContent).toContain('并非真实患者或研究结果')
    expect(footer?.textContent).toContain('并非真实患者或研究结果')
    expect(footer?.textContent).toContain('Baselio 虚构演示')
    expect(page.textContent).not.toContain(JA_LINE)
  }

  initI18n('ja')
  useLocaleStore.setState({ preference: 'ja', locale: 'ja' })
  await act(async () => {
    root?.render(<SampleAbstractDialog open onClose={() => undefined} />)
  })
  expect(container!.textContent).toContain(JA_LINE)
  expect(container!.textContent?.split(JA_LINE).length).toBe(7)
  expect(container!.querySelectorAll('[data-testid="sample-abstract-footer"]')).toHaveLength(3)

  const source = readFileSync('src/renderer/src/pages/home/SampleAbstractDialog.tsx', 'utf8')
  // Saving goes through the main-process Save As dialog: no fetch, no remote URL, and no
  // renderer-side `<a download>` that reports a save the operating system may have cancelled.
  expect(source).not.toMatch(/fetch\(|https?:\/\//)
  expect(source).toContain('saveBlobFile')
  expect(source).not.toContain('createObjectURL')
})

it('uses the selected language for every sample page and footer', async () => {
  for (const locale of LOCALES) {
    initI18n(locale)
    useLocaleStore.setState({ preference: locale, locale })
    await renderDialog()
    const pages = [...(container?.querySelectorAll('[data-testid="sample-abstract-page"]') ?? [])]
    expect(pages).toHaveLength(3)
    pages.forEach((page, index) => {
      expect(page.querySelector('h3')?.textContent).toBe(
        sampleAbstracts.documents[locale].pages[index]?.title
      )
    })
    if (locale !== 'ja') expect(container?.textContent).not.toMatch(/[\u3040-\u30ff]/)
    await act(async () => root?.unmount())
    root = null
    container?.remove()
  }
})
