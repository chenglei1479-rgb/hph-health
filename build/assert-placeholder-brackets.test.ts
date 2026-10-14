import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { assertPlaceholderBracketsAbsent, noticeFiles } =
  require('./assert-placeholder-brackets.cjs') as {
    assertPlaceholderBracketsAbsent: (
      projectDir: string,
      relativeFiles?: readonly string[],
      env?: NodeJS.ProcessEnv
    ) => void
    noticeFiles: (projectDir: string, env?: NodeJS.ProcessEnv) => string[]
  }

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const cleanNotice = '# 利用統計\n\nこの通知に記入欄はありません。\n'

const project = (files: { notice?: string; consent?: string; terms?: string }): string => {
  const dir = mkdtempSync(join(tmpdir(), 'dra-notice-pack-'))
  dirs.push(dir)
  mkdirSync(join(dir, 'docs', 'privacy'), { recursive: true })
  writeFileSync(join(dir, 'docs', 'privacy', 'usage-notice.ja.md'), files.notice ?? cleanNotice)
  if (files.consent !== undefined || files.terms !== undefined) {
    mkdirSync(join(dir, 'resources'))
  }
  if (files.consent !== undefined) {
    writeFileSync(join(dir, 'resources', 'account-consent.json'), files.consent)
  }
  if (files.terms !== undefined) {
    writeFileSync(join(dir, 'resources', 'terms-of-use.json'), files.terms)
  }
  return dir
}

it('rejects a packaged privacy notice that still contains placeholder brackets', () => {
  expect(() =>
    assertPlaceholderBracketsAbsent(project({ notice: '運営者：【運営会社名】\n' }))
  ).toThrow(/usage-notice\.ja\.md/)
  expect(() => assertPlaceholderBracketsAbsent(project({ notice: '連絡先】\n' }))).toThrow(
    /【 or 】/
  )
})

it('rejects account consent or terms text with the same bracket check when those files exist', () => {
  expect(() =>
    assertPlaceholderBracketsAbsent(project({ consent: '{"body":"【運営会社名】"}' }))
  ).toThrow(/account-consent\.json/)
  expect(() =>
    assertPlaceholderBracketsAbsent(
      project({ terms: '{"body":"【利用条件の詳細】"}', consent: '{"body":"本文"}' })
    )
  ).toThrow(/terms-of-use\.json/)
})

it('allows packaged notices after the placeholder brackets are removed', () => {
  expect(() => assertPlaceholderBracketsAbsent(project({}))).not.toThrow()
  const dir = project({ consent: '{"body":"本文"}', terms: '{"body":"本文"}' })
  expect(noticeFiles(dir)).toEqual([
    'docs/privacy/usage-notice.ja.md',
    'resources/account-consent.json',
    'resources/terms-of-use.json'
  ])
  expect(() => assertPlaceholderBracketsAbsent(dir)).not.toThrow()
})

it('requires the privacy notice instead of treating a missing file as finished', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dra-notice-missing-'))
  dirs.push(dir)
  expect(() => assertPlaceholderBracketsAbsent(dir)).toThrow(/usage-notice\.ja\.md/)
})

it('skips unused consent and terms files on a prerelease build and still blocks the privacy notice', () => {
  const dir = project({
    notice: cleanNotice,
    consent: '{"title":"【外国にある第三者への個人データの提供に関する同意】"}',
    terms: '{"title":"【利用規約】"}'
  })
  const env = { DRA_PRERELEASE: '1' }
  expect(noticeFiles(dir, env)).toEqual(['docs/privacy/usage-notice.ja.md'])
  expect(() => assertPlaceholderBracketsAbsent(dir, undefined, env)).not.toThrow()
  expect(() =>
    assertPlaceholderBracketsAbsent(
      project({
        notice: '運営者：【運営会社名】\n',
        consent: '{"title":"【同意】"}',
        terms: '{"title":"【利用規約】"}'
      }),
      undefined,
      env
    )
  ).toThrow(/usage-notice\.ja\.md/)
})

it('is wired into electron-builder before the package is assembled', () => {
  const config = readFileSync('electron-builder.yml', 'utf8')
  expect(config).toContain('beforePack: build/assert-placeholder-brackets.cjs')
})

it('follows the shipped privacy notice, so unfinished placeholder brackets fail a packaged build', () => {
  const text = readFileSync('docs/privacy/usage-notice.ja.md', 'utf8')
  const unfinished = text.includes('【') || text.includes('】')
  if (unfinished) expect(() => assertPlaceholderBracketsAbsent(process.cwd())).toThrow(/【 or 】/)
  else expect(() => assertPlaceholderBracketsAbsent(process.cwd())).not.toThrow()
})
