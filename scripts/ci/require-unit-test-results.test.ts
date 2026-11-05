import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

import {
  REQUIRED_TEST_FILE,
  executedTestCount,
  verifyUnitTestReport
} from './require-unit-test-results.mjs'

const script = fileURLToPath(new URL('./require-unit-test-results.mjs', import.meta.url))
const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

type Status = 'passed' | 'failed' | 'skipped' | 'pending'
const result = (name: string, statuses: Status[]) => ({
  name: `/home/runner/work/hph-health/${name}`,
  assertionResults: statuses.map((status) => ({ status }))
})
const report = (results: ReturnType<typeof result>[]) => ({
  numTotalTests: results.reduce((total, entry) => total + entry.assertionResults.length, 0),
  testResults: results
})

const writeReport = (value: unknown): string => {
  const directory = mkdtempSync(join(tmpdir(), 'unit-test-guard-'))
  directories.push(directory)
  const file = join(directory, 'results.json')
  writeFileSync(file, JSON.stringify(value))
  return file
}

describe('verifyUnitTestReport', () => {
  it('accepts a report that executed the inventory file and other tests', () => {
    expect(
      verifyUnitTestReport(
        report([
          result(REQUIRED_TEST_FILE, ['passed']),
          result('src/shared/notebook-warnings.test.ts', ['passed'])
        ])
      )
    ).toEqual([])
  })

  it('rejects a run that collected nothing', () => {
    expect(verifyUnitTestReport(report([]))).toContain('The run collected no tests at all.')
    expect(verifyUnitTestReport({})).toEqual([
      'The run collected no tests at all.',
      'The run executed no test assertions.',
      `${REQUIRED_TEST_FILE} did not run.`
    ])
  })

  it('rejects a run that never reached the inventory file', () => {
    const problems = verifyUnitTestReport(report([result('src/shared/acp.test.ts', ['passed'])]))
    expect(problems).toEqual([`${REQUIRED_TEST_FILE} did not run.`])
  })

  it('rejects an inventory file whose assertions were all skipped', () => {
    const problems = verifyUnitTestReport(
      report([result(REQUIRED_TEST_FILE, ['skipped', 'pending'])])
    )
    expect(problems).toContain(`${REQUIRED_TEST_FILE} ran but executed no assertions.`)
    expect(problems).toContain('The run executed no test assertions.')
  })

  it('counts executed assertions only', () => {
    expect(executedTestCount(report([result('a.test.ts', ['passed', 'failed', 'skipped'])]))).toBe(
      2
    )
  })

  it('rejects an unreadable report', () => {
    expect(verifyUnitTestReport(undefined)).toEqual([
      'The Vitest JSON report is missing or unreadable.'
    ])
  })
})

describe('require-unit-test-results CLI', () => {
  it('exits 0 and reports the executed count for a valid report', () => {
    const run = spawnSync(
      process.execPath,
      [script, writeReport(report([result(REQUIRED_TEST_FILE, ['passed'])]))],
      { encoding: 'utf8' }
    )
    expect(run.status).toBe(0)
    expect(run.stdout).toContain('Unit tests executed: 1 assertions')
    expect(run.stdout).toContain(REQUIRED_TEST_FILE)
  })

  it('exits 1 when the report shows no executed tests', () => {
    const run = spawnSync(process.execPath, [script, writeReport(report([]))], { encoding: 'utf8' })
    expect(run.status).toBe(1)
    expect(run.stderr).toContain('FAIL The run collected no tests at all.')
  })

  it('exits 1 when the report file is missing', () => {
    const directory = mkdtempSync(join(tmpdir(), 'unit-test-guard-'))
    directories.push(directory)
    const run = spawnSync(process.execPath, [script, join(directory, 'absent.json')], {
      encoding: 'utf8'
    })
    expect(run.status).toBe(1)
    expect(run.stderr).toContain('Unit-test evidence is unreadable')
  })
})
