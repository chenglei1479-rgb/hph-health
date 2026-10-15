// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { EthicsWritingNotice } from './EthicsWritingNotice'
import { WritingSafeguardsEntry } from './WritingSafeguardsEntry'

const projects = vi.fn(async () => [{ id: 'study-1', name: '肺癌研究' }])
const getEthicsApproval = vi.fn(async () => ({ approvalNumber: '' }))
const setEthicsApproval = vi.fn(async (request: { approvalNumber: string }) => ({
  approvalNumber: request.approvalNumber.trim()
}))

describe('writing safeguards', () => {
  let root: Root | null = null
  let container: HTMLDivElement | null = null

  afterEach(() => {
    act(() => root?.unmount())
    container?.remove()
    root = null
    container = null
    vi.unstubAllGlobals()
  })

  const renderEntry = async (): Promise<HTMLDivElement> => {
    window.api = {
      projects: { list: projects },
      writingSafeguards: { getEthicsApproval, setEthicsApproval }
    } as unknown as Window['api']
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root?.render(<WritingSafeguardsEntry />)
    })
    const open = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === '執筆時の確認'
    )
    await act(async () => {
      open?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    return container
  }

  it('shows a non-blocking ethics reminder before writing when the number is empty', async () => {
    const host = await renderEntry()
    const begin = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent === '執筆を始める'
    )
    expect(begin?.hasAttribute('disabled')).toBe(false)
    await act(async () => {
      begin?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(host.querySelector('[data-ethics-writing-reminder]')?.textContent).toContain(
      '倫理審査の承認番号が未入力です'
    )
    expect(host.textContent).toContain('執筆を始めました。')
    expect(begin?.hasAttribute('disabled')).toBe(false)
    const noticeHost = document.createElement('div')
    const noticeRoot = createRoot(noticeHost)
    await act(async () => {
      noticeRoot.render(<EthicsWritingNotice open approvalNumber="" />)
    })
    expect(noticeHost.querySelector('[role="dialog"]')).toBeNull()
    expect(noticeHost.querySelector('[data-ethics-writing-reminder]')?.textContent).toContain(
      '執筆は続けられます'
    )
    await act(async () => {
      noticeRoot.render(<EthicsWritingNotice open approvalNumber="2024-医-018" />)
    })
    expect(noticeHost.querySelector('[data-ethics-writing-reminder]')).toBeNull()
    act(() => noticeRoot.unmount())
  })

  it('builds an editable bilingual disclosure and adds the conflict sentence', async () => {
    const host = await renderEntry()
    const declaration = host.querySelector('textarea[aria-label="開示の下書き"]')
    expect(declaration).toBeInstanceOf(HTMLTextAreaElement)
    if (!(declaration instanceof HTMLTextAreaElement)) return
    expect(declaration.value).toContain('全責任を負い')
    expect(declaration.value).toContain('full responsibility')
    const checkbox = host.querySelector('input[type="checkbox"]')
    await act(async () => {
      if (!(checkbox instanceof HTMLInputElement)) return
      checkbox.click()
    })
    const updated = host.querySelector('textarea[aria-label="開示の下書き"]')
    expect(updated).toBeInstanceOf(HTMLTextAreaElement)
    if (!(updated instanceof HTMLTextAreaElement)) return
    expect(updated.value).toContain('DRA の無償提供を受けた')
    expect(updated.value).toContain('The authors received DRA free of charge.')
    await act(async () => {
      declaration?.dispatchEvent(new Event('input', { bubbles: true }))
      if (declaration instanceof HTMLTextAreaElement) {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype,
          'value'
        )?.set
        setter?.call(declaration, '著者が直した開示です。')
        declaration.dispatchEvent(new Event('change', { bubbles: true }))
      }
    })
    const edited = host.querySelector('textarea[aria-label="開示の下書き"]')
    expect(edited).toBeInstanceOf(HTMLTextAreaElement)
    if (!(edited instanceof HTMLTextAreaElement)) return
    expect(edited.value).toBe('著者が直した開示です。')
  })

  it('holds manuscript, script, report, and table export until the doctor confirms', async () => {
    const host = await renderEntry()
    const createObjectURL = vi.fn(() => 'blob:manuscript')
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() })
    const manuscript = host.querySelector('textarea[aria-label="原稿"]')
    await act(async () => {
      if (!(manuscript instanceof HTMLTextAreaElement)) return
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value'
      )?.set
      setter?.call(manuscript, 'カルテ番号：0083341 の経過を記す。')
      manuscript.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const exportManuscript = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent === '原稿を書き出す'
    )
    await act(async () => {
      exportManuscript?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(createObjectURL).not.toHaveBeenCalled()
    expect(host.textContent).toContain('カルテ番号')
    const confirm = host.querySelectorAll('input[type="checkbox"]')
    const confirmBox = [...confirm].at(-1)
    await act(async () => {
      if (!(confirmBox instanceof HTMLInputElement)) return
      confirmBox.click()
    })
    await act(async () => {
      exportManuscript?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(createObjectURL).toHaveBeenCalled()

    class ImmediateReader {
      result: string | ArrayBuffer | null = null
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      readAsText(file: File): void {
        void file.text().then((text) => {
          this.result = text
          this.onload?.()
        })
      }
    }
    vi.stubGlobal('FileReader', ImmediateReader)
    const input = host.querySelector('input[type="file"]')
    const file = new File(['生年月日: 1980-04-12\n'], 'note.md', { type: 'text/markdown' })
    Object.defineProperty(input, 'files', { configurable: true, value: [file] })
    await act(async () => {
      input?.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await act(async () => {
      await Promise.resolve()
    })
    createObjectURL.mockClear()
    const exportFiles = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent === 'ファイルを書き出す'
    )
    await act(async () => {
      if (confirmBox instanceof HTMLInputElement && confirmBox.checked) confirmBox.click()
    })
    await act(async () => {
      exportFiles?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(createObjectURL).not.toHaveBeenCalled()
    expect(host.textContent).toContain('生年月日')
  })
})
