// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useLocaleStore } from '@/stores/locale-store'

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

  const renderEntry = async (overrides: Record<string, unknown> = {}): Promise<HTMLDivElement> => {
    useLocaleStore.setState({ preference: 'ja', locale: 'ja' })
    window.api = {
      projects: { list: projects },
      writingSafeguards: {
        getEthicsApproval,
        setEthicsApproval,
        getEthicsProtocol: vi.fn(async () => ({
          choices: {},
          notApplicableItems: [],
          notApplicableReasons: {},
          confirmedMappings: [],
          headingCandidates: []
        }))
      },
      ...overrides
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

  const selectProject = async (host: HTMLDivElement): Promise<void> => {
    const select = host.querySelector('select')
    if (!select) throw new Error('project select is missing')
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype,
        'value'
      )?.set
      setter?.call(select, 'study-1')
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await act(async () => {
      await Promise.resolve()
    })
  }

  const declarationValue = (host: HTMLDivElement): string => {
    const declaration = host.querySelector('textarea[aria-label="開示の下書き"]')
    return declaration instanceof HTMLTextAreaElement ? declaration.value : ''
  }

  const sessionApi = (
    runs: readonly Record<string, unknown>[],
    options: { sessions?: readonly { id: string; projectId: string; updatedAt: number }[] } = {}
  ): Record<string, unknown> => ({
    sessions: {
      list: vi.fn(async () => ({
        sessions: options.sessions ?? [{ id: 'session-1', projectId: 'study-1', updatedAt: 9 }]
      })),
      loadOne: vi.fn(async () => ({ cwd: '/workspace' }))
    },
    notebook: { runIndex: vi.fn(async () => runs) }
  })

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
    // The review clause is not in the text before the author confirms it (#133).
    expect(declaration.value).not.toContain('記載内容は著者自身が確認した。')
    const checkboxes = Array.from(
      host.querySelectorAll<HTMLInputElement>(
        '[data-writing-safeguards-disclosure] input[type="checkbox"]'
      )
    )
    const coi = checkboxes.find((box) =>
      box.getAttribute('aria-label')?.startsWith('利益相反の文を加える')
    )
    await act(async () => {
      coi?.click()
    })
    const updated = host.querySelector('textarea[aria-label="開示の下書き"]')
    expect(updated).toBeInstanceOf(HTMLTextAreaElement)
    if (!(updated instanceof HTMLTextAreaElement)) return
    expect(updated.value).toContain(
      '本研究では、【運営会社名（未設定）】よりベースリオの無償提供を受けた。'
    )
    expect(updated.value).toContain(
      'This study received Baselio free of charge from [Operating company name (not set)].'
    )
    expect(updated.value).not.toContain('DRA')
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
    const confirmBox = host.querySelector(
      '[data-writing-safeguards-findings] input[type="checkbox"]'
    )
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
    const input = host.querySelector('[data-writing-safeguards-export-files] input[type="file"]')
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

  // #133: the old panel started from four template rows and a review sentence that claimed the
  // authors had checked them. Both were statements about work nobody had necessarily done.
  it('declares only the executions the project recorded', async () => {
    const host = await renderEntry(
      sessionApi([
        {
          runId: 'run-agent-1',
          source: 'agent',
          kernelKind: 'python',
          status: 'completed',
          startedAt: 2
        },
        {
          runId: 'run-user-1',
          source: 'user',
          kernelKind: 'python',
          status: 'completed',
          startedAt: 3
        }
      ])
    )
    await selectProject(host)

    expect(declarationValue(host)).toContain('実行 ID: run-agent-1')
    expect(declarationValue(host)).not.toContain('run-user-1')
    expect(declarationValue(host)).not.toContain('文献の検索と整理')
    expect(declarationValue(host)).not.toContain('統計計画の下書き')
    const statements = host.querySelectorAll('[data-writing-safeguards-statement]')
    expect(statements).toHaveLength(1)
    expect(statements[0]?.textContent).toContain('run-agent-1')
  })

  it('keeps the review sentence out until the author verifies the declaration', async () => {
    const host = await renderEntry(
      sessionApi([
        {
          runId: 'run-agent-1',
          source: 'agent',
          kernelKind: 'python',
          status: 'completed',
          startedAt: 2
        }
      ])
    )
    await selectProject(host)

    expect(declarationValue(host)).not.toContain('記載内容は著者自身が確認した。')
    const review = host.querySelector('[data-writing-safeguards-review-state]')
    expect(review?.textContent).toBe('Unconfirmed')

    const checkbox = host.querySelector('input[aria-label="I verified this declaration."]')
    await act(async () => {
      if (checkbox instanceof HTMLInputElement) checkbox.click()
    })

    expect(declarationValue(host)).toContain('記載内容は著者自身が確認した。')
    expect(host.querySelector('[data-writing-safeguards-review-state]')?.textContent).toBe(
      'Confirmed'
    )
  })

  it('says nothing was executed when the project has no recorded execution', async () => {
    const host = await renderEntry(sessionApi([]))
    await selectProject(host)

    expect(declarationValue(host)).toContain('エージェントによる実行の記録がない')
    expect(host.querySelectorAll('[data-writing-safeguards-statement]')).toHaveLength(0)
    expect(host.querySelector('[data-writing-safeguards-runs-count]')).not.toBeNull()
    expect(host.querySelector('[data-writing-safeguards-runs-unavailable]')).toBeNull()
  })

  it('reports unreadable run records instead of declaring no AI usage', async () => {
    const host = await renderEntry()
    await selectProject(host)

    expect(host.querySelector('[data-writing-safeguards-runs-unavailable]')).not.toBeNull()
    expect(host.querySelector('[data-writing-safeguards-runs-count]')).toBeNull()
    // "we could not look" must not be rendered as "there was nothing".
    expect(declarationValue(host)).not.toContain('エージェントによる実行の記録がない')
  })
})
