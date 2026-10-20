import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { deidentify, MY_NUMBER_WARNING } from './deidentify'
import { detectPhi } from './detect'
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

  it('keeps a structured address and ignores a prefecture that has no street', () => {
    const store = createMemoryPhiVault().store('address')
    const labeled = deidentify('住所：北海道札幌市中央区北一条西2丁目3-4', store)
    expect(labeled.text.startsWith('住所：')).toBe(true)
    expect(labeled.text).not.toContain('札幌市')
    expect(labeled.text).not.toContain('2丁目')
    const bare = detectPhi('東京都のカルテ番号は研究用です')
    expect(bare.some((span) => span.category === 'ADDRESS')).toBe(false)
    const drug = detectPhi('レボフロキサシン 500 mg')
    expect(drug.some((span) => span.category === 'ADDRESS')).toBe(false)
  })

  it('redacts a ward and a hospital room as separate facility spans', () => {
    const spans = detectPhi('南2病棟 18号室\n病室番号：7').filter(
      (span) => span.category === 'FACILITY'
    )
    expect(spans.map((span) => span.text).sort()).toEqual(['18号室', '7', '南2病棟'])
    const store = createMemoryPhiVault().store('room')
    const result = deidentify('病室番号：7\n南2病棟 18号室', store)
    expect(result.text).toContain('病室番号：')
    expect(result.text).not.toContain('18号室')
    expect(result.text).not.toMatch(/病室番号：7/)
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

it('keeps known vault replacements stable while scanning adjacent new PHI', () => {
  const store = createMemoryPhiVault().store('fiction')
  const first = deidentify('患者：架空 太郎', store)
  expect(deidentify(first.text, store).text).toBe(first.text)
  const manual = store.manual('Fictional identifier')
  expect(deidentify(manual, store).text).toBe(manual)
  const combined = deidentify(first.text + '\nカルテ番号：0098765', store)
  expect(combined.text).not.toContain('0098765')
  expect(combined.text).not.toBe(first.text + '\nカルテ番号：0098765')
  expect(store.restore(combined.text)).toContain('架空 太郎')
})
