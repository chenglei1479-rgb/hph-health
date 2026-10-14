import { createHmac } from 'node:crypto'

import type { ParsedDate } from './detect'

const ERAS = [
  { name: '令和', letter: 'R', start: Date.UTC(2019, 4, 1), base: 2018 },
  { name: '平成', letter: 'H', start: Date.UTC(1989, 0, 8), base: 1988 },
  { name: '昭和', letter: 'S', start: Date.UTC(1926, 11, 25), base: 1925 },
  { name: '大正', letter: 'T', start: Date.UTC(1912, 6, 30), base: 1911 },
  { name: '明治', letter: 'M', start: Date.UTC(1868, 0, 25), base: 1867 }
] as const

// Maps an HMAC digest onto ±180 days and never zero, so a patient date always moves.
export function offsetDaysFromDigest(digest: Buffer): number {
  const bucket = digest.readUInt32BE(0) % 360
  return bucket < 180 ? bucket - 180 : bucket - 179
}

export function patientDateOffset(projectKey: Buffer, patientPseudonym: string): number {
  const digest = createHmac('sha256', projectKey).update(`date\0${patientPseudonym}`).digest()
  return offsetDaysFromDigest(digest)
}

export function shiftUtcDate(
  parsed: ParsedDate,
  days: number
): { y: number; m: number; d: number } {
  const year = parsed.y ?? 2026
  const month = parsed.m ?? 1
  const day = parsed.d ?? 1
  const utc = new Date(Date.UTC(year, month - 1, day))
  utc.setUTCDate(utc.getUTCDate() + days)
  return { y: utc.getUTCFullYear(), m: utc.getUTCMonth() + 1, d: utc.getUTCDate() }
}

function eraOf(y: number, m: number, d: number): { name: string; letter: string; eraYear: number } {
  const utc = Date.UTC(y, m - 1, d)
  for (const era of ERAS) {
    if (utc >= era.start) return { name: era.name, letter: era.letter, eraYear: y - era.base }
  }
  return { name: '明治', letter: 'M', eraYear: y - 1867 }
}

function applyDigitWidth(rendered: string, original: string): string {
  if (!/[０-９]/.test(original)) return rendered
  return rendered.replace(/\d/g, (digit) => String.fromCharCode(digit.charCodeAt(0) + 0xfee0))
}

// Writes a shifted civil date back in the style of the source span.
export function formatShiftedDate(original: string, parsed: ParsedDate, days: number): string {
  const shifted = shiftUtcDate(parsed, days)
  const style = parsed.style.replace(/生$/, '')
  const era = eraOf(shifted.y, shifted.m, shifted.d)
  let rendered: string
  if (style.startsWith('本年')) {
    rendered = `本年${shifted.m}月`
  } else if (/^(令和|平成|昭和|大正|明治)/.test(style)) {
    const yearText = era.eraYear === 1 && style.includes('元') ? '元' : String(era.eraYear)
    rendered = `${era.name}${yearText}年`
    if (style.includes('月')) rendered += `${shifted.m}月`
    if (style.includes('日')) rendered += `${shifted.d}日`
  } else if (/^[MTSHR]/.test(style)) {
    rendered = `${era.letter}${era.eraYear}.${shifted.m}.${shifted.d}`
  } else if (style.includes('年')) {
    rendered = `${shifted.y}年`
    if (style.includes('月')) rendered += `${shifted.m}月`
    if (style.includes('日')) rendered += `${shifted.d}日`
  } else if (/^\d{4}[./-]\d/.test(style)) {
    const separator = style.match(/[./-]/)?.[0] ?? '-'
    rendered = `${shifted.y}${separator}${shifted.m}${separator}${shifted.d}`
  } else if (/^\d{2}\/\d{2}\/\d{2}$/.test(style)) {
    rendered = `${String(shifted.y).slice(2)}/${String(shifted.m).padStart(2, '0')}/${String(shifted.d).padStart(2, '0')}`
  } else if (style.includes('月')) {
    rendered = `${shifted.m}月${shifted.d}日`
  } else {
    rendered = `${shifted.m}/${shifted.d}`
  }
  if (original.endsWith('生') && !rendered.endsWith('生')) rendered += '生'
  return applyDigitWidth(rendered, original)
}
