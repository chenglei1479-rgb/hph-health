import { afterEach, describe, expect, it } from 'vitest'

import { installMachineApproval } from '../phi/gate'
import {
  installVariableDefinitionTextReleaser,
  releaseVariableDefinitionText
} from './release-model-text'

afterEach(() => {
  installVariableDefinitionTextReleaser(null)
  installMachineApproval(null)
})

describe('releaseVariableDefinitionText', () => {
  it('redacts locally and then through the production PHI gate', async () => {
    installMachineApproval(() => true)
    const released = await releaseVariableDefinitionText(
      '担当は山田太郎さんです。患者氏名：佐藤花子。',
      'study-1'
    )
    expect(released).not.toContain('山田太郎')
    expect(released).not.toContain('佐藤花子')
    expect(released).toContain('[仮名化済み]')
    expect(released).toMatch(/\[患者\d+\]/)
    expect(released).not.toContain('匿名化')
  })

  it('blocks a remaining patient name when the machine is not approved', async () => {
    await expect(
      releaseVariableDefinitionText('担当は山田太郎さんです。', 'study-1')
    ).rejects.toThrow(/not sent|承認|PHI/)
  })
})
