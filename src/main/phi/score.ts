import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { deidentify } from './deidentify'
import { detectPhi, type PhiCategory } from './detect'
import { createMemoryPhiVault } from './store'

export interface GoldSpan {
  record: string
  start: number
  end: number
  category: string
  text: string
  is_phi: boolean
  age_ge_90?: boolean
}

export interface ScoreRow {
  tp: number
  fp: number
  fn: number
  precision: number
  recall: number
  f1: number
  n: number
}

const PATIENT = [
  'PERSON_NAME',
  'DATE',
  'ADDRESS',
  'PHONE',
  'EMAIL',
  'FACILITY',
  'KARTE_NO',
  'INSURER_NO',
  'INSURED_ID',
  'MY_NUMBER'
] as const

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

function prf(
  gold: Array<{ record: string; start: number; end: number }>,
  pred: Array<{ record: string; start: number; end: number }>,
  mode: 'overlap' | 'exact'
): ScoreRow {
  const used = new Set<number>()
  let tp = 0
  for (const span of gold) {
    const index = pred.findIndex((item, itemIndex) => {
      if (used.has(itemIndex) || item.record !== span.record) return false
      if (mode === 'exact') return item.start === span.start && item.end === span.end
      return item.start < span.end && span.start < item.end
    })
    if (index >= 0) {
      used.add(index)
      tp += 1
    }
  }
  const fp = pred.length - used.size
  const fn = gold.length - tp
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp)
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn)
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)
  return {
    tp,
    fp,
    fn,
    precision: round(precision),
    recall: round(recall),
    f1: round(f1),
    n: gold.length
  }
}

function loadJsonl<T>(path: string): T[] {
  return readFileSync(path, 'utf8')
    .trim()
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as T)
}

export function scoreFixture(directory: string): Record<string, unknown> {
  const gold = loadJsonl<GoldSpan>(join(directory, 'records_gold.jsonl'))
  const records = readdirSync(join(directory, 'records')).filter((name) => name.endsWith('.txt'))
  const predictions: Array<GoldSpan & { kind?: string }> = []
  // Fixed key so the published dev table does not flicker. Production vaults use a random key.
  const vault = createMemoryPhiVault({ key: Buffer.alloc(32, 7) })
  const store = vault.store('dev-eval')
  let calendar = 0
  let calendarShifted = 0
  let calendarTextChanged = 0
  let documentDates = 0
  let documentKept = 0
  let age90 = 0
  let age90Replaced = 0
  const misses: Array<{ category: string; text: string; record: string }> = []

  for (const record of records) {
    const text = readFileSync(join(directory, 'records', record), 'utf8')
    const detected = detectPhi(text)
    for (const span of detected) predictions.push({ ...span, record, is_phi: true })
    const redacted = deidentify(text, store)
    for (const span of gold.filter(
      (item) => item.record === record && item.is_phi && item.category === 'DATE'
    )) {
      const cover = detected.find(
        (item) => item.category === 'DATE' && item.start < span.end && span.start < item.end
      )
      if (span.age_ge_90) {
        age90 += 1
        const replacement = redacted.replacements.find(
          (item) =>
            item.start < span.end && span.start < item.end && item.replacement.includes('90歳以上')
        )
        if (replacement) age90Replaced += 1
        continue
      }
      if (cover?.kind === 'document') {
        documentDates += 1
        if (redacted.text.includes(span.text)) documentKept += 1
        continue
      }
      if (cover?.kind === 'calendar') {
        calendar += 1
        const replacement = redacted.replacements.find(
          (item) => item.shifted && item.start < span.end && span.start < item.end
        )
        if (replacement) {
          calendarShifted += 1
          if (replacement.replacement !== replacement.original) calendarTextChanged += 1
        }
      }
    }
  }

  const report: Record<string, Record<string, ScoreRow>> = {}
  for (const mode of ['overlap', 'exact'] as const) {
    report[mode] = {}
    for (const category of [...PATIENT, 'PHYSICIAN_NAME']) {
      report[mode][category] = prf(
        gold.filter((span) => span.is_phi && span.category === category),
        predictions.filter((span) => span.category === category),
        mode
      )
    }
    report[mode].PATIENT = prf(
      gold.filter(
        (span) => span.is_phi && PATIENT.includes(span.category as (typeof PATIENT)[number])
      ),
      predictions.filter((span) => PATIENT.includes(span.category as (typeof PATIENT)[number])),
      mode
    )
  }

  const hard = ['PERSON_NAME', 'MY_NUMBER', 'INSURER_NO', 'INSURED_ID', 'KARTE_NO'] as const
  const hardRecall: Record<string, number> = {}
  for (const category of hard) hardRecall[category] = report.overlap[category].recall
  for (const category of hard) {
    for (const span of gold.filter((item) => item.is_phi && item.category === category)) {
      const hit = predictions.some(
        (pred) =>
          pred.record === span.record &&
          pred.category === category &&
          pred.start < span.end &&
          span.start < pred.end
      )
      if (!hit) misses.push({ category, text: span.text, record: span.record })
    }
  }

  const categoryMisses: Array<{
    mode: 'overlap' | 'exact'
    category: string
    text: string
    record: string
  }> = []
  for (const mode of ['overlap', 'exact'] as const) {
    for (const category of [...PATIENT, 'PHYSICIAN_NAME']) {
      if (report[mode][category].fn === 0) continue
      const pred = predictions.filter((span) => span.category === category)
      const used = new Set<number>()
      for (const span of gold.filter((item) => item.is_phi && item.category === category)) {
        const index = pred.findIndex((item, itemIndex) => {
          if (used.has(itemIndex) || item.record !== span.record) return false
          if (mode === 'exact') return item.start === span.start && item.end === span.end
          return item.start < span.end && span.start < item.end
        })
        if (index >= 0) used.add(index)
        else if (categoryMisses.length < 40) {
          categoryMisses.push({ mode, category, text: span.text, record: span.record })
        }
      }
    }
  }

  const ageGold = gold.filter((span) => span.is_phi && span.age_ge_90 === true)
  const ageHit = ageGold.filter((span) =>
    predictions.some(
      (pred) => pred.record === span.record && pred.start < span.end && span.start < pred.end
    )
  )
  const decoys = gold.filter((span) => span.is_phi === false)
  const decoyHit = decoys.filter((span) =>
    predictions.some(
      (pred) => pred.record === span.record && pred.start < span.end && span.start < pred.end
    )
  )
  const drug = decoys.filter((span) => span.category === 'DRUG' || span.category === 'DISEASE')
  const drugHit = drug.filter((span) =>
    predictions.some(
      (pred) => pred.record === span.record && pred.start < span.end && span.start < pred.end
    )
  )

  const entities = loadJsonl<{
    category: PhiCategory
    text: string
    value_start: number
  }>(join(directory, 'entities.jsonl'))
  const entityMiss: Array<{ category: string; text: string }> = []
  for (const entity of entities) {
    if (!hard.includes(entity.category as (typeof hard)[number]) && entity.category !== 'DATE')
      continue
    const found = detectPhi(entity.text)
    const hit = found.some(
      (span) =>
        span.category === entity.category &&
        span.start < entity.text.length &&
        entity.value_start < span.end
    )
    if (!hit) entityMiss.push({ category: entity.category, text: entity.text })
  }

  const patientOverlap = report.overlap.PATIENT
  const patientExact = report.exact.PATIENT
  const decoyRate = decoyHit.length / decoys.length
  const drugRate = drugHit.length / drug.length
  const ageRecall = ageHit.length / ageGold.length
  const thresholds = {
    patientOverlapRecall: patientOverlap.recall >= 0.97,
    patientExactRecall: patientExact.recall >= 0.93,
    hardRecall: hard.every((category) => hardRecall[category] === 1),
    ageRecall: ageRecall === 1,
    decoyRate: decoyRate <= 0.1,
    drugDiseaseRate: drugRate <= 0.05,
    entityHardMisses:
      entityMiss.filter((item) => hard.includes(item.category as (typeof hard)[number])).length ===
      0,
    calendarShift: calendar === 0 || calendarShifted / calendar >= 0.97
  }
  return {
    ok: Object.values(thresholds).every(Boolean),
    thresholds,
    patient: report,
    hardRecall,
    ageRecall: round(ageRecall),
    ageN: ageGold.length,
    age90Replaced: age90 === 0 ? 1 : round(age90Replaced / age90),
    decoyRate: round(decoyRate),
    decoyN: decoys.length,
    drugDiseaseRate: round(drugRate),
    drugN: drug.length,
    physicianOverlap: report.overlap.PHYSICIAN_NAME,
    physicianExact: report.exact.PHYSICIAN_NAME,
    calendarShiftRecall: calendar === 0 ? 1 : round(calendarShifted / calendar),
    calendarTextChanged: calendar === 0 ? 1 : round(calendarTextChanged / calendar),
    calendarN: calendar,
    documentKept: documentDates === 0 ? 1 : round(documentKept / documentDates),
    documentN: documentDates,
    missCount: misses.length,
    misses: misses.slice(0, 20),
    categoryMisses,
    entityMissCount: entityMiss.length,
    entityMisses: entityMiss.slice(0, 20)
  }
}
