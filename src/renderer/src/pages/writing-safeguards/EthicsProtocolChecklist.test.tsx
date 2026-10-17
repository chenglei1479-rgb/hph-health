// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EthicsProtocolChecklist } from './EthicsProtocolChecklist'

describe('EthicsProtocolChecklist', () => {
  it('renders 25 items with five unanswered three-way questions', () => {
    render(<EthicsProtocolChecklist />)
    expect(screen.getAllByRole('listitem')).toHaveLength(25)
    expect(screen.getAllByRole('radio')).toHaveLength(15)
    expect(
      screen.getAllByRole('radio').every((radio) => !(radio as HTMLInputElement).checked)
    ).toBe(true)
    expect(screen.getByText(/Baselio analyzes patient data/)).toBeTruthy()
  })
  it('renders English source keys when no translated locale is active', () => {
    render(<EthicsProtocolChecklist />)
    expect(
      screen.getAllByRole('heading', { name: 'Research protocol checklist' }).length
    ).toBeGreaterThan(0)
  })
})
