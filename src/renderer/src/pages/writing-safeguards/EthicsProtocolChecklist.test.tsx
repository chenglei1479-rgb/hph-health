// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EthicsProtocolChecklist } from './EthicsProtocolChecklist'

const originalApi = window.api

afterEach(() => {
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
    expect(screen.getByText(/Baselio analyzes patient data/)).toBeTruthy()
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
  })

  it('lets a doctor correct and confirm imported heading mappings through the protocol API', async () => {
    const setEthicsProtocol = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        writingSafeguards: {
          getEthicsProtocol: vi.fn().mockResolvedValue({
            choices: {},
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
})
