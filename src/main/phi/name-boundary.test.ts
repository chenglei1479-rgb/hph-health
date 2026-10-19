import { describe, expect, it } from 'vitest'
import { detectPhi } from './detect'
import { deidentify } from './deidentify'
import { createMemoryPhiVault } from './store'

describe('patient name boundaries before labeled metadata', () => {
  it.each(['カルテ番号：0098765', '生年月日：昭和9年2月3日', '年齢：92歳'])(
    'redacts the fictional name without consuming the next field: %s',
    (next) => {
      const text = `患者：架空 太郎\n${next}`
      const names = detectPhi(text).filter((span) => span.category === 'PERSON_NAME')
      expect(names.map((span) => span.text)).toContain('架空 太郎')
      const released = deidentify(text, createMemoryPhiVault().store('fiction')).text
      expect(released).not.toMatch(/架空 太郎|0098765|昭和9年2月3日|92歳/)
    }
  )
  it('keeps support for a name continued on one line before the age field', () => {
    const text = '患者：架空\n太郎\n年齢：92歳'
    expect(
      detectPhi(text).some((span) => span.category === 'PERSON_NAME' && span.text.includes('太郎'))
    ).toBe(true)
    expect(deidentify(text, createMemoryPhiVault().store('fiction')).text).not.toContain('太郎')
  })
})
