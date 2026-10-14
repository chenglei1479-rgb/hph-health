import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { deidentify, MY_NUMBER_WARNING } from './deidentify'
import { createEncryptedPhiVault, createMemoryPhiVault, createTestPhiCipher } from './store'

describe('Japanese PHI de-identification', () => {
  it('keeps field labels and replaces only the value', () => {
    const store = createMemoryPhiVault().store('labels')
    const result = deidentify('マイナンバー：123456789013', store)
    expect(result.text.startsWith('マイナンバー：')).toBe(true)
    expect(result.text).not.toContain('123456789013')
    expect(result.text).toContain('[番号')
    expect(result.warnings).toEqual([MY_NUMBER_WARNING])
    expect(result.text).not.toContain(MY_NUMBER_WARNING)
  })

  it('detects a My Number with an invalid check digit', () => {
    const store = createMemoryPhiVault().store('checksum')
    const result = deidentify('個人番号 111122223333', store)
    expect(result.text).not.toContain('111122223333')
    expect(result.warnings).toEqual([MY_NUMBER_WARNING])
  })

  it('does not redact drug names, eponymous diseases, or relative dates', () => {
    const store = createMemoryPhiVault().store('decoy')
    const text = '川崎病および橋本病。メトホルミン 500 mg。術後3日目。jRCT1031230456。CRP 2.4。'
    expect(deidentify(text, store).text).toBe(text)
  })

  it('coarsens ages of 90 or older and leaves study dates unshifted', () => {
    const store = createMemoryPhiVault().store('age')
    const result = deidentify('年齢：95歳\n記載日：令和8年4月5日\n研究期間：2020年1月1日', store)
    expect(result.text).toContain('90歳以上')
    expect(result.text).not.toContain('95')
    expect(result.text).toContain('記載日：令和8年4月5日')
    expect(result.text).toContain('研究期間：2020年1月1日')
  })

  it('shifts a patient date and keeps the same offset for that patient', () => {
    const vault = createMemoryPhiVault()
    const first = deidentify(
      '患者：山田 太郎\nカルテ番号：0083341\n受診日：令和6年4月1日',
      vault.store('shift')
    )
    const second = deidentify('カルテ番号：0083341\n再診：令和6年4月1日', vault.store('shift'))
    const shifted = first.replacements.find((item) => item.shifted)
    const chart = first.text.match(/\[番号\d+\]/)?.[0]
    expect(shifted?.replacement).not.toBe('令和6年4月1日')
    expect(chart).toBeTruthy()
    expect(second.text).toContain(shifted?.replacement ?? 'missing')
    expect(second.text).toContain(chart ?? 'missing')
  })

  it('uses a different project key so another project cannot restore the name', () => {
    const vault = createMemoryPhiVault()
    const released = deidentify('患者：山田 太郎　年齢：78歳', vault.store('project-a'))
    expect(released.text).not.toContain('山田 太郎')
    const restored = vault.store('project-a').restore(released.text)
    expect(restored).toContain('山田 太郎')
    expect(vault.store('project-b').restore(released.text)).not.toContain('山田 太郎')
  })

  it('refuses to pass a high-risk value through an allow list', () => {
    const store = createMemoryPhiVault().store('allow')
    const result = deidentify('マイナンバー：123456789013\n川崎病', store, {
      allowOriginal: ['123456789013', '川崎病']
    })
    expect(result.text).not.toContain('123456789013')
    expect(result.text).toContain('川崎病')
  })

  it('stores the mapping encrypted, outside the project directory, without the raw name in the file', () => {
    const directory = mkdtempSync(join(tmpdir(), 'dra-phi-'))
    const cipher = createTestPhiCipher()
    const vault = createEncryptedPhiVault(directory, cipher)
    const projectDir = mkdtempSync(join(tmpdir(), 'dra-project-'))
    expect(directory.startsWith(projectDir)).toBe(false)
    const result = deidentify('患者：山田 太郎', vault.store('encrypted'))
    const bytes = readFileSync(vault.filePath)
    expect(bytes.includes(Buffer.from('山田 太郎'))).toBe(false)
    expect(result.text).not.toContain('山田 太郎')
    const log = vault.readLog()
    expect(log.some((event) => event.action === 'deidentify')).toBe(true)
    expect(JSON.stringify(log)).not.toContain('山田 太郎')
    expect(cipher.decryptString(bytes)).toContain('山田 太郎')
  })
})
