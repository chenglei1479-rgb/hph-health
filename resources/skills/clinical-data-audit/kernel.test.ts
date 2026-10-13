import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const python =
  process.env.PYTHON ||
  ['/opt/homebrew/bin/python3', '/usr/local/bin/python3', '/usr/bin/python3'].find(existsSync)
const gate = python ? describe : describe.skip
const testFile = resolve(dirname(fileURLToPath(import.meta.url)), 'test_kernel.py')

gate('clinical-data-audit standard-library input reader', () => {
  it('reads Japanese CSV/TSV/XLSX unchanged and fails clearly on malformed inputs', () => {
    expect(() =>
      execFileSync(python as string, ['-B', testFile], { timeout: 10_000 })
    ).not.toThrow()
  })
})
