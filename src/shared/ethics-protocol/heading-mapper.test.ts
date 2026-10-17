import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { confirmHeadingMapping, mapHeading } from './heading-mapper'

const forms = readdirSync(resolve('test/fixtures/ethics-forms')).map(
  (name) =>
    JSON.parse(readFileSync(resolve('test/fixtures/ethics-forms', name), 'utf8')) as {
      institution: string
      headings: { text: string; item: number }[]
    }
)

describe('R8 heading mapper', () => {
  it('maps at least 90% of headings across twelve fictional forms', () => {
    expect(forms).toHaveLength(12)
    expect(forms.every(({ institution }) => institution.includes('架空'))).toBe(true)
    const headings = forms.flatMap(({ headings }) => headings)
    const correct = headings.filter(({ text, item }) => mapHeading(text).item === item).length
    expect(correct / headings.length).toBeGreaterThanOrEqual(0.9)
  })
  it('marks ambiguous headings unknown and requires doctor confirmation', () => {
    const candidate = mapHeading('その他')
    expect(candidate.status).toBe('対応不明')
    expect(() => confirmHeadingMapping(candidate, 4, '', '')).toThrow()
    expect(
      confirmHeadingMapping(candidate, 4, 'doctor-1', '2026-10-17T12:00:00+09:00')
    ).toMatchObject({ item: 4, confirmedBy: 'doctor-1' })
  })
})
