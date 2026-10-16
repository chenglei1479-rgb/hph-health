import { describe, expect, it } from 'vitest'

import { coiCheckboxLabel } from '../../../../shared/writing-safeguards/ai-usage-declaration'
import { writingSafeguardsCopy } from './copy'

describe('writing safeguards copy', () => {
  it('uses the configured conflict sentence in every locale', () => {
    for (const locale of ['ja', 'en', 'zh-CN', 'zh-TW', 'de', 'es', 'fr', 'ko', 'ru'] as const) {
      expect(writingSafeguardsCopy(locale).coi).toBe(coiCheckboxLabel(locale))
      expect(writingSafeguardsCopy(locale).coi).not.toContain('DRA')
    }
  })
})
