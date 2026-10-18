// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
