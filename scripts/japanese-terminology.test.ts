import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

const FORBIDDEN_JAPANESE_TERMS = ['匿名化', '匿名統計']

const shippedJapaneseFiles = (root: string): string[] => {
  const files = [
    'src/shared/i18n/locales/ja.json',
    'docs/hospital-it-allowlist.md',
    'resources/external-endpoints.json'
  ]
  const privacy = join(root, 'docs/privacy')
  if (statSync(privacy, { throwIfNoEntry: false })?.isDirectory()) {
    for (const name of readdirSync(privacy)) {
      if (name.endsWith('.ja.md')) files.push(join('docs/privacy', name))
    }
  }
  return files
}

const hitsIn = (root: string, relativePath: string): string[] => {
  const text = readFileSync(join(root, relativePath), 'utf8')
  return FORBIDDEN_JAPANESE_TERMS.filter((term) => text.includes(term)).map(
    (term) => `${relative(root, join(root, relativePath))}: ${term}`
  )
}

describe('Japanese terminology', () => {
  it('flags 匿名化 in a Japanese string', () => {
    const sample = 'この文には匿名化が残っています'
    expect(FORBIDDEN_JAPANESE_TERMS.some((term) => sample.includes(term))).toBe(true)
  })

  it('fails if 匿名化 appears in shipped Japanese strings', () => {
    const root = process.cwd()
    const hits = shippedJapaneseFiles(root).flatMap((file) => hitsIn(root, file))
    expect(hits).toEqual([])
  })
})
