// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { i18next, initI18n } from '../../i18n'
import { EthicsProtocolChecklist } from './EthicsProtocolChecklist'

const originalApi = window.api

const installApi = (overrides: Record<string, unknown>): void => {
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      saveBlobFile: vi.fn(async () => ({ saved: true, filePath: '/tmp/draft.docx' })),
      writingSafeguards: {
        getEthicsProtocol: vi.fn(async () => ({
          choices: {},
          notApplicableItems: [],
          notApplicableReasons: {},
          confirmedMappings: [],
          headingCandidates: []
        })),
        setEthicsProtocol: vi.fn(),
        importEthicsDocx: vi.fn(),
        exportEthicsDraft: vi.fn()
      },
      ...overrides
    }
  })
}

afterEach(() => {
  cleanup()
  Object.defineProperty(window, 'api', { value: originalApi, configurable: true })
})

describe('EthicsProtocolChecklist', () => {
  it('renders 25 items with five unanswered three-way questions', () => {
    render(<EthicsProtocolChecklist projectId="" />)
    expect(screen.getAllByRole('listitem')).toHaveLength(25)
    expect(screen.getAllByRole('radio')).toHaveLength(15)
    expect(
      screen.getAllByRole('radio').every((radio) => !(radio as HTMLInputElement).checked)
    ).toBe(true)
    expect(
      screen.getByText(/Analysis runs on this computer\. Requests you send go to the AI service/)
    ).toBeTruthy()
  })
  it('renders English source keys when no translated locale is active', () => {
    render(<EthicsProtocolChecklist projectId="" />)
    expect(
      screen.getAllByRole('heading', { name: 'Research protocol checklist' }).length
    ).toBeGreaterThan(0)
    expect(screen.getAllByText('Yes').length).toBeGreaterThan(0)
    expect(screen.queryByText('Ethics checklist: yes')).toBeNull()
  })

  it('hides the missing marker only after an answer or a not-applicable reason is entered', () => {
    const { container } = render(<EthicsProtocolChecklist projectId="" />)
    expect(container.querySelector('[data-ethics-missing="18"]')).not.toBeNull()
    const item18 = within(container).getByRole('group', { name: '18' })
    fireEvent.click(within(item18).getByRole('radio', { name: 'Yes' }))
    expect(container.querySelector('[data-ethics-missing="18"]')).toBeNull()

    const item3 = within(container).getAllByRole('listitem')[2]
    fireEvent.click(within(item3).getByRole('checkbox', { name: 'Not applicable' }))
    expect(container.querySelector('[data-ethics-missing="3"]')).not.toBeNull()
    fireEvent.change(within(item3).getByRole('textbox', { name: 'Reason it does not apply 3' }), {
      target: { value: 'No intervention' }
    })
    expect(container.querySelector('[data-ethics-missing="3"]')).toBeNull()

    const section1 = within(container).getByRole('textbox', {
      name: 'Protocol section content 1'
    })
    expect(container.querySelector('[data-ethics-missing="1"]')).not.toBeNull()
    fireEvent.change(section1, { target: { value: '〇〇' } })
    expect(container.querySelector('[data-ethics-missing="1"]')).not.toBeNull()
    fireEvent.change(section1, { target: { value: 'Doctor-authored protocol text' } })
    expect(container.querySelector('[data-ethics-missing="1"]')).toBeNull()

    const section21 = within(container).getByRole('textbox', {
      name: 'Protocol section content 21'
    })
    fireEvent.change(section21, { target: { value: '補償なし' } })
    expect(container.querySelector('[data-ethics-missing="21"]')?.textContent).toBe(
      'Partially missing'
    )

    const item16 = within(container).getAllByRole('listitem')[15]
    fireEvent.click(within(item16).getByRole('checkbox', { name: 'Not applicable' }))
    expect(container.querySelector('[data-ethics-missing="16"]')?.textContent).toBe(
      'Partially missing'
    )
    expect(container.textContent).not.toMatch(/科学的に妥当|scientifically (?:valid|sound)/iu)
  })

  it('lets a doctor correct and confirm imported heading mappings through the protocol API', async () => {
    const setEthicsProtocol = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        writingSafeguards: {
          getEthicsProtocol: vi.fn().mockResolvedValue({
            choices: {},
            notApplicableItems: [16],
            notApplicableReasons: {},
            confirmedMappings: [],
            headingCandidates: [
              { heading: '独自の研究方法欄', item: null, confidence: 0.4, status: '対応不明' }
            ]
          }),
          setEthicsProtocol,
          importEthicsDocx: vi.fn(),
          exportEthicsDraft: vi.fn()
        }
      }
    })

    render(<EthicsProtocolChecklist projectId="study-1" />)
    const mapping = await screen.findByRole('combobox', {
      name: 'Select checklist item: 独自の研究方法欄'
    })
    fireEvent.change(mapping, { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText('Confirming doctor'), {
      target: { value: 'doctor-1' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm heading mappings' }))

    await waitFor(() => expect(setEthicsProtocol).toHaveBeenCalledTimes(1))
    expect(setEthicsProtocol.mock.calls[0][0]).toMatchObject({
      projectId: 'study-1',
      protocol: {
        notApplicableItems: [16],
        confirmedMappings: [
          expect.objectContaining({
            heading: '独自の研究方法欄',
            item: 4,
            confirmedBy: 'doctor-1'
          })
        ]
      }
    })
  })

  // Same silent-failure class as the download button: without the guard this click threw a
  // synchronous TypeError and the page did nothing at all.
  it('escapes no error when the mapping is confirmed without a preload bridge', async () => {
    const setEthicsProtocol = vi.fn()
    installApi({
      writingSafeguards: {
        getEthicsProtocol: vi.fn(async () => ({
          choices: {},
          notApplicableItems: [],
          notApplicableReasons: {},
          confirmedMappings: [],
          headingCandidates: [
            { heading: '独自の研究方法欄', item: null, confidence: 0.4, status: '対応不明' }
          ]
        })),
        setEthicsProtocol,
        importEthicsDocx: vi.fn(),
        exportEthicsDraft: vi.fn()
      }
    })

    render(<EthicsProtocolChecklist projectId="study-1" />)
    await screen.findByRole('combobox', { name: 'Select checklist item: 独自の研究方法欄' })
    fireEvent.change(screen.getByLabelText('Confirming doctor'), {
      target: { value: 'doctor-1' }
    })
    Object.defineProperty(window, 'api', { configurable: true, value: undefined })
    const escaped: unknown[] = []
    const capture = (event: ErrorEvent): void => {
      escaped.push(event.error)
    }
    window.addEventListener('error', capture)

    try {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm heading mappings' }))
    } finally {
      window.removeEventListener('error', capture)
    }
    // A handler that escapes into the window error channel is the silent failure itself: the page
    // does nothing and the doctor gets no reason.
    expect(escaped).toEqual([])
    expect(setEthicsProtocol).not.toHaveBeenCalled()
  })

  // #132: the download used to end in a rejected IPC promise with nobody listening, so a refusal
  // and a dead button looked the same. Each way out below is one observable result.
  it('shows the reason and the code when the draft export is refused', async () => {
    const saveBlobFile = vi.fn()
    installApi({
      saveBlobFile,
      writingSafeguards: {
        getEthicsProtocol: vi.fn(async () => ({
          choices: {},
          notApplicableItems: [],
          notApplicableReasons: {},
          confirmedMappings: [],
          headingCandidates: []
        })),
        setEthicsProtocol: vi.fn(),
        importEthicsDocx: vi.fn(),
        exportEthicsDraft: vi.fn(async () => ({
          ok: false,
          code: 'ethics-draft-blocked-phi',
          fileName: '研究計画書_草案.docx'
        }))
      }
    })

    render(<EthicsProtocolChecklist projectId="study-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Download incomplete DOCX draft' }))

    const message = await screen.findByText(/研究計画書_草案\.docx was not created/)
    expect(message.textContent).toContain('patient information')
    expect(message.textContent).toContain('ethics-draft-blocked-phi')
    expect(saveBlobFile).not.toHaveBeenCalled()
  })

  it('writes the exported bytes through the save dialog', async () => {
    const saveBlobFile = vi.fn<
      (request: { suggestedName: string; mimeType: string; data: ArrayBuffer }) => Promise<{
        saved: boolean
        filePath?: string
      }>
    >(async () => ({ saved: true, filePath: '/tmp/draft.docx' }))
    installApi({
      saveBlobFile,
      writingSafeguards: {
        getEthicsProtocol: vi.fn(async () => ({
          choices: {},
          notApplicableItems: [],
          notApplicableReasons: {},
          confirmedMappings: [],
          headingCandidates: []
        })),
        setEthicsProtocol: vi.fn(),
        importEthicsDocx: vi.fn(),
        exportEthicsDraft: vi.fn(async () => ({
          ok: true,
          fileName: '研究計画書_草案.docx',
          bytes: [80, 75, 3, 4]
        }))
      }
    })

    render(<EthicsProtocolChecklist projectId="study-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Download incomplete DOCX draft' }))

    await waitFor(() => expect(saveBlobFile).toHaveBeenCalledOnce())
    const request = saveBlobFile.mock.calls[0]?.[0] as {
      suggestedName: string
      mimeType: string
      data: ArrayBuffer
    }
    expect(request.suggestedName).toBe('研究計画書_草案.docx')
    expect(request.mimeType).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
    expect([...new Uint8Array(request.data)]).toEqual([80, 75, 3, 4])
    expect(screen.queryByText(/patient information/)).toBeNull()
  })

  it('says that nothing was saved when the save dialog is cancelled', async () => {
    installApi({
      saveBlobFile: vi.fn(async () => ({ saved: false })),
      writingSafeguards: {
        getEthicsProtocol: vi.fn(async () => ({
          choices: {},
          notApplicableItems: [],
          notApplicableReasons: {},
          confirmedMappings: [],
          headingCandidates: []
        })),
        setEthicsProtocol: vi.fn(),
        importEthicsDocx: vi.fn(),
        exportEthicsDraft: vi.fn(async () => ({
          ok: true,
          fileName: '研究計画書_草案.docx',
          bytes: [1]
        }))
      }
    })

    render(<EthicsProtocolChecklist projectId="study-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Download incomplete DOCX draft' }))

    expect(await screen.findByText('No file was saved.')).toBeTruthy()
  })

  it('reports the missing desktop bridge instead of returning silently', async () => {
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { saveBlobFile: vi.fn() }
    })

    render(<EthicsProtocolChecklist projectId="study-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Download incomplete DOCX draft' }))

    const message = await screen.findByText(/could not be saved because this window/)
    expect(message.textContent).toContain('ethics-draft-bridge-unavailable')
  })

  it('runs one export for a same-tick double click', async () => {
    let release: (value: { ok: true; fileName: string; bytes: number[] }) => void = () => undefined
    const exportEthicsDraft = vi.fn(
      () =>
        new Promise<{ ok: true; fileName: string; bytes: number[] }>((resolve) => {
          release = resolve
        })
    )
    installApi({
      writingSafeguards: {
        getEthicsProtocol: vi.fn(async () => ({
          choices: {},
          notApplicableItems: [],
          notApplicableReasons: {},
          confirmedMappings: [],
          headingCandidates: []
        })),
        setEthicsProtocol: vi.fn(),
        importEthicsDocx: vi.fn(),
        exportEthicsDraft
      }
    })

    render(<EthicsProtocolChecklist projectId="study-1" />)
    const button = screen.getByRole('button', { name: 'Download incomplete DOCX draft' })
    fireEvent.click(button)
    fireEvent.click(button)

    expect(exportEthicsDraft).toHaveBeenCalledTimes(1)
    await act(async () => {
      release({ ok: true, fileName: '研究計画書_草案.docx', bytes: [1] })
    })
  })

  it('renders the refusal in the active locale', async () => {
    initI18n('ja')
    await act(async () => {
      await i18next.changeLanguage('ja')
    })
    try {
      installApi({
        writingSafeguards: {
          getEthicsProtocol: vi.fn(async () => ({
            choices: {},
            notApplicableItems: [],
            notApplicableReasons: {},
            confirmedMappings: [],
            headingCandidates: []
          })),
          setEthicsProtocol: vi.fn(),
          importEthicsDocx: vi.fn(),
          exportEthicsDraft: vi.fn(async () => ({
            ok: false,
            code: 'ethics-draft-blocked-phi',
            fileName: '研究計画書_草案.docx'
          }))
        }
      })

      render(<EthicsProtocolChecklist projectId="study-1" />)
      const button = screen.getByRole('button', { name: '未完成の DOCX 草案をダウンロード' })
      fireEvent.click(button)

      const message = await screen.findByText(/研究計画書_草案\.docx は作成されませんでした/)
      expect(message.textContent).toContain('患者情報')
      expect(message.textContent).toContain('ethics-draft-blocked-phi')
    } finally {
      initI18n('en')
      await act(async () => {
        await i18next.changeLanguage('en')
      })
    }
  })

  it('reports a missing preload bridge when window.api itself is absent', async () => {
    Object.defineProperty(window, 'api', { configurable: true, value: undefined })

    render(<EthicsProtocolChecklist projectId="study-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Download incomplete DOCX draft' }))

    // Without the optional chain this read threw inside the handler and landed on
    // "could not be created. Try again." — advice that cannot work when the bridge is gone.
    const message = await screen.findByText(/could not be saved because this window/)
    expect(message.textContent).toContain('ethics-draft-bridge-unavailable')
    expect(screen.queryByText(/could not be created/)).toBeNull()
  })

  it('separates a failed write from a failed export', async () => {
    installApi({
      saveBlobFile: vi.fn(async () => {
        throw new Error('EACCES')
      }),
      writingSafeguards: {
        getEthicsProtocol: vi.fn(async () => ({
          choices: {},
          notApplicableItems: [],
          notApplicableReasons: {},
          confirmedMappings: [],
          headingCandidates: []
        })),
        setEthicsProtocol: vi.fn(),
        importEthicsDocx: vi.fn(),
        exportEthicsDraft: vi.fn(async () => ({
          ok: true,
          fileName: '研究計画書_草案.docx',
          bytes: [1]
        }))
      }
    })

    render(<EthicsProtocolChecklist projectId="study-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Download incomplete DOCX draft' }))

    const message = await screen.findByText(/could not be saved\. The draft was created/)
    expect(message.textContent).toContain('ethics-draft-save-failed')
    expect(screen.queryByText(/could not be created/)).toBeNull()
  })

  it('clears the notice when the project changes', async () => {
    installApi({
      writingSafeguards: {
        getEthicsProtocol: vi.fn(async () => ({
          choices: {},
          notApplicableItems: [],
          notApplicableReasons: {},
          confirmedMappings: [],
          headingCandidates: []
        })),
        setEthicsProtocol: vi.fn(),
        importEthicsDocx: vi.fn(),
        exportEthicsDraft: vi.fn(async () => ({
          ok: false,
          code: 'ethics-draft-blocked-phi',
          fileName: '研究計画書_草案.docx'
        }))
      }
    })

    const { rerender } = render(<EthicsProtocolChecklist projectId="study-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Download incomplete DOCX draft' }))
    expect(await screen.findByText(/was not created because the draft contains/)).toBeTruthy()

    rerender(<EthicsProtocolChecklist projectId="study-2" />)
    await waitFor(() =>
      expect(screen.queryByText(/was not created because the draft contains/)).toBeNull()
    )
  })
})
