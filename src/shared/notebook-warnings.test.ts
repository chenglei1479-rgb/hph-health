import { expect, it } from 'vitest'

import {
  NOTEBOOK_WARNING_COUNT_LIMIT,
  NOTEBOOK_WARNING_TEXT_LIMIT,
  normalizeNotebookWarnings
} from './notebook-warnings'

it('never splits a surrogate pair at the text budget boundary', () => {
  // The budget ends exactly between the two UTF-16 units of the astral character.
  const head = 'a'.repeat(NOTEBOOK_WARNING_TEXT_LIMIT - 1)
  const warnings = normalizeNotebookWarnings([`${head}\u{1F600}tail`])
  expect(warnings).toEqual([head])
  expect(warnings[0]).not.toMatch(/[\uD800-\uDBFF]$/u)
})

it('keeps the count and text caps for arbitrary producer input', () => {
  const warnings = normalizeNotebookWarnings([null, 4, ...Array(100).fill('x'.repeat(1000))])
  expect(warnings.length).toBeLessThanOrEqual(NOTEBOOK_WARNING_COUNT_LIMIT)
  expect(warnings.join('').length).toBeLessThanOrEqual(NOTEBOOK_WARNING_TEXT_LIMIT)
})
