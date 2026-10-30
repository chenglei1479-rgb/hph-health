// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { i18next } from '@/i18n'
import { homeExternalDestinationLines } from './external-destinations'
import type { SeedKeyMode } from '../../../../shared/seed-invite'

const destinationLine = (mode: SeedKeyMode): string =>
  homeExternalDestinationLines(i18next.t.bind(i18next), mode)[0]

// The first line used to come from a hard-coded Japanese helper, so every non-Japanese locale showed
// Japanese in the home "Details" list and in Settings > Network.
describe('home external destination line follows the UI language', () => {
  beforeEach(async () => {
    await i18next.changeLanguage('zh-Hans')
  })

  afterEach(async () => {
    await i18next.changeLanguage('en')
  })

  it('names the matching destination in Simplified Chinese', () => {
    expect(destinationLine('company')).toBe('运营方签约的 AI（测试版为 OpenAI）')
    expect(destinationLine('byok')).toBe('您注册的服务商')
    expect(destinationLine('none')).toBe('未配置 AI 服务商')
  })

  it('leaves no Japanese fragment behind', () => {
    const lines = (['company', 'byok', 'none'] as const).map(destinationLine).join('\n')

    expect(lines).not.toContain('運営が契約')
    expect(lines).not.toContain('先生が登録')
    expect(lines).not.toContain('未設定')
  })
})
