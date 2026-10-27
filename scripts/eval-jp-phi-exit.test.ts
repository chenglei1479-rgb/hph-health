import { describe, expect, it } from 'vitest'
import { exitCodeFor } from './eval-jp-phi-exit.mjs'

describe('japanese PHI eval exit code', () => {
  it('fails when the run wrote no report', () => {
    expect(exitCodeFor({ status: 1, reportPresent: false, report: null })).toBe(1)
    expect(exitCodeFor({ status: 0, reportPresent: false, report: null })).toBe(1)
  })

  it('fails when the report exists but cannot be parsed', () => {
    expect(exitCodeFor({ status: 1, reportPresent: true, report: null })).toBe(1)
    expect(exitCodeFor({ status: 0, reportPresent: true, report: null })).toBe(1)
  })

  it('fails when the report says a threshold was missed', () => {
    expect(exitCodeFor({ status: 0, reportPresent: true, report: { ok: false } })).toBe(1)
    expect(exitCodeFor({ status: 0, reportPresent: true, report: { ok: 'yes' } })).toBe(1)
  })

  it('follows vitest when the report passed', () => {
    expect(exitCodeFor({ status: 0, reportPresent: true, report: { ok: true } })).toBe(0)
    expect(exitCodeFor({ status: 2, reportPresent: true, report: { ok: true } })).toBe(2)
    expect(exitCodeFor({ status: null, reportPresent: true, report: { ok: true } })).toBe(1)
  })
})
