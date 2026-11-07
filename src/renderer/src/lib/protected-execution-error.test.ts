// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { initI18n } from '@/i18n'
import { describeProtectedExecutionFailure } from './protected-execution-error'

describe('doctor-facing protected execution copy', () => {
  it('returns Japanese guidance with the stable diagnostic number', () => {
    initI18n('ja')
    const copy = describeProtectedExecutionFailure(
      'ApplicationCommandError: Windows runtime is incompatible with protected execution.'
    )
    expect(copy).toContain('保護された実行を開始できませんでした')
    // The two capabilities are reported separately and narrowly: only the schema-table Python (import
    // and statistics) works without the protected runtime, so the copy must not say "Notebook still runs".
    expect(copy).toContain('表の取り込みと集計はそのまま使えます')
    expect(copy).not.toContain('Python 実行はそのまま使えます')
    expect(copy).toContain('設定 > ネットワーク')
    // Both fixes the product actually has, and no instruction to simply retry.
    expect(copy).toContain('もう一度実行してください')
    expect(copy).toContain('再インストール')
    expect(copy).toContain('WIN-PROTECTED-EXEC-01')
  })

  it('treats the native ACL failure as the same diagnostic', () => {
    initI18n('ja')
    expect(
      describeProtectedExecutionFailure(
        'grant AppContainer access to D:\\runtime: WINDOWS_ACL_ACCESS_DENIED: write command ACL'
      )
    ).toContain('WIN-PROTECTED-EXEC-01')
  })

  it('does not rewrite unrelated failures', () => {
    initI18n('ja')
    expect(describeProtectedExecutionFailure('Kernel exited unexpectedly.')).toBeUndefined()
  })
})
