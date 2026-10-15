import { releaseTextThroughPhiGate } from './notebook-phi-release'
import { PSEUDONYMIZED_MARK } from './patient-phi'

export const CATEGORICAL_RELEASE_LIMIT = 12

const FREE_TEXT_LENGTH = 40

export const omittedCategoricalNote = (omitted: number): string => `他 ${omitted} 種類は省略`

export const isOmittedCategoricalNote = (value: string): boolean =>
  /^他 \d+ 種類は省略$/.test(value)

export const isFreeTextValue = (value: string): boolean => {
  const trimmed = value.trim()
  if (trimmed.length > FREE_TEXT_LENGTH) return true
  if (/[\r\n。]/.test(trimmed)) return true
  return /\s/.test(trimmed) && trimmed.length > 24
}

/** Short labels may be opted in. Free-text prose may not, even when it rarely repeats. */
export const isOptInCategorical = (values: readonly string[]): boolean => {
  const present = values.map((value) => value.trim()).filter((value) => value.length > 0)
  if (present.length === 0) return false
  if (present.some((value) => isFreeTextValue(value))) return false
  const distinct = new Set(present)
  const ratio = distinct.size / present.length
  if (distinct.size <= CATEGORICAL_RELEASE_LIMIT && ratio <= 0.5) return true
  return distinct.size > CATEGORICAL_RELEASE_LIMIT
}

export const rankCategoricalValues = (values: readonly string[]): string[] => {
  const counts = new Map<string, number>()
  for (const raw of values) {
    const value = raw.trim()
    if (!value) continue
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'ja'))
    .map(([value]) => value)
}

export const limitCategoricalValues = (ranked: readonly string[]): string[] => {
  if (ranked.length <= CATEGORICAL_RELEASE_LIMIT) return [...ranked]
  const omitted = ranked.length - CATEGORICAL_RELEASE_LIMIT
  return [...ranked.slice(0, CATEGORICAL_RELEASE_LIMIT), omittedCategoricalNote(omitted)]
}

/**
 * Top 12 by frequency, then the same PHI gate used for Notebook output.
 * A refused value is replaced with the pseudonym mark and is not sent raw.
 */
export const releaseCategoricalValuesForModel = async (
  ranked: readonly string[],
  projectId: string
): Promise<string[]> => {
  const limited = limitCategoricalValues(ranked)
  const released: string[] = []
  for (const value of limited) {
    if (isOmittedCategoricalNote(value)) {
      released.push(value)
      continue
    }
    released.push(await releaseTextThroughPhiGate(value, projectId, PSEUDONYMIZED_MARK))
  }
  return released
}
