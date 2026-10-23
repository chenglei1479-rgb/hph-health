import { describe, expect, it } from 'vitest'

import { i18next } from '@/i18n'
import { provisionProgressText } from '../workspace/provision-progress-text'
import {
  skillMarketplaceDisabledText,
  specialistMarketplaceDisabledText,
  windowsRuntimeDownloadDisabledText
} from './downloads-disabled-copy'

// Closed-state copy must be readable in the three launch locales. A missing catalog entry would
// silently render English, so assert the exact translated output instead of the key.
describe('downloads disabled copy', () => {
  it('renders the R1 runtime notice in ja, zh-Hans, and en', () => {
    expect(provisionProgressText(i18next.getFixedT('ja'), { code: 'runtime-cdn-disabled' })).toBe(
      'この版では Python / R の実行環境をダウンロードできません。配布元からのお知らせをお待ちください。'
    )
    expect(
      provisionProgressText(i18next.getFixedT('zh-Hans'), { code: 'runtime-cdn-disabled' })
    ).toBe('这个版本无法下载 Python / R 运行环境，请等待发布方通知。')
    expect(provisionProgressText(i18next.getFixedT('en'), { code: 'runtime-cdn-disabled' })).toBe(
      "This version can't download the Python/R runtime. Watch for an update from the distributor."
    )
  })

  it('renders the R2 Windows runtime notice in ja, zh-Hans, and en', () => {
    expect(windowsRuntimeDownloadDisabledText(i18next.getFixedT('ja'))).toBe(
      'この版では Windows 用の Notebook 実行環境をダウンロードできません。配布元からのお知らせをお待ちください。'
    )
    expect(windowsRuntimeDownloadDisabledText(i18next.getFixedT('zh-Hans'))).toBe(
      '这个版本无法下载 Windows 版 Notebook 运行环境，请等待发布方通知。'
    )
    expect(windowsRuntimeDownloadDisabledText(i18next.getFixedT('en'))).toBe(
      "This version can't download the Windows notebook runtime. Watch for an update from the distributor."
    )
  })

  it('renders the R3 Skill marketplace notice in ja, zh-Hans, and en', () => {
    expect(skillMarketplaceDisabledText(i18next.getFixedT('ja'))).toBe(
      'スキルマーケットプレイスは現在ご利用いただけません。インストール済みのスキルはそのまま使えます。'
    )
    expect(skillMarketplaceDisabledText(i18next.getFixedT('zh-Hans'))).toBe(
      '技能市场暂不提供。已安装的技能可以照常使用。'
    )
    expect(skillMarketplaceDisabledText(i18next.getFixedT('en'))).toBe(
      "The skill marketplace isn't available right now. Skills you've already installed still work."
    )
  })

  it('renders the R5 Specialist marketplace notice in ja, zh-Hans, and en', () => {
    expect(specialistMarketplaceDisabledText(i18next.getFixedT('ja'))).toBe(
      'スペシャリストマーケットプレイスは現在ご利用いただけません。追加済みのスペシャリストはそのまま使えます。'
    )
    expect(specialistMarketplaceDisabledText(i18next.getFixedT('zh-Hans'))).toBe(
      '专家市场暂不提供。已添加的专家可以照常使用。'
    )
    expect(specialistMarketplaceDisabledText(i18next.getFixedT('en'))).toBe(
      "The specialist marketplace isn't available right now. Specialists you've already added still work."
    )
  })
})
