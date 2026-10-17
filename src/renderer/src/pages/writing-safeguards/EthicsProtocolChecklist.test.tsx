// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EthicsProtocolChecklist } from './EthicsProtocolChecklist'

describe('EthicsProtocolChecklist', () => {
  it('renders 25 items with five unanswered three-way questions', () => {
    render(<EthicsProtocolChecklist locale="ja" />)
    expect(screen.getAllByRole('listitem')).toHaveLength(25)
    expect(screen.getAllByRole('radio')).toHaveLength(15)
    expect(
      screen.getAllByRole('radio').every((radio) => !(radio as HTMLInputElement).checked)
    ).toBe(true)
    expect(screen.getByText(/Baselio では患者データ/)).toBeTruthy()
  })
  it('follows the selected simplified Chinese locale', () => {
    render(<EthicsProtocolChecklist locale="zh-Hans" />)
    expect(screen.getByRole('heading', { name: '研究计划书检查清单' })).toBeTruthy()
  })
})
