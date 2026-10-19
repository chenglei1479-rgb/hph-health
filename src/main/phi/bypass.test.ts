import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '..', '..', '..')

function sourceFiles(directory: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) {
      found.push(...sourceFiles(path))
      continue
    }
    if (!entry.endsWith('.ts')) continue
    if (entry.includes('.test.') || entry.endsWith('.d.ts')) continue
    found.push(path)
  }
  return found
}

const DIRECT_PROMPT_FILES = new Set([
  'src/main/acp/provider-prompt-executor.ts',
  'src/main/acp/context-compaction-workflow.ts',
  'src/main/reviewer/review-assessment-owner.ts'
])

describe('PHI gate bypass', () => {
  it('requires every direct model prompt to pass through the PHI module', () => {
    const offenders: string[] = []
    for (const path of sourceFiles(join(ROOT, 'src', 'main'))) {
      const relativePath = relative(ROOT, path).split('\\').join('/')
      const source = readFileSync(path, 'utf8')
      const promptLines = source.split('\n').filter((line) => {
        const trimmed = line.trim()
        return (
          trimmed.includes('.prompt(') &&
          !trimmed.startsWith('//') &&
          !trimmed.startsWith('*') &&
          !trimmed.startsWith('/*')
        )
      })
      if (promptLines.length === 0) continue
      const onlyUserPermission = promptLines.every(
        (line) => line.includes('this.prompt(') || line.includes('agent.prompt(')
      )
      if (onlyUserPermission) continue
      if (!DIRECT_PROMPT_FILES.has(relativePath)) offenders.push(relativePath)
      else if (!source.includes('releasePromptContent') && !source.includes('releaseModelText')) {
        offenders.push(`${relativePath} missing release`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('guards provider HTTP bodies inside fetchProviderRequest', () => {
    const source = readFileSync(join(ROOT, 'src/main/settings/provider-fetch.ts'), 'utf8')
    const guardAt = source.indexOf('return sendPhiChecked(')
    const fetchAt = source.indexOf('return fetchImpl')
    expect(guardAt).toBeGreaterThan(-1)
    expect(fetchAt).toBeGreaterThan(guardAt)
    const generation = readFileSync(
      join(ROOT, 'src/main/settings/provider-text-generation.ts'),
      'utf8'
    )
    expect(generation).toContain('fetchProviderRequest')
    expect(generation).not.toMatch(/(?<![\w.])fetch\(/)
  })
})
