import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

import { NOTEBOOK_PR_EXCLUDE_PATTERNS } from '../../vitest.config'
import {
  REQUIRED_TEST_FILE,
  allowSkipPattern,
  executedTestCount,
  unusedSkipAllowances,
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

// #192 follow-up: `--require` proves a file ran, not that the case that matters inside it ran. A
// skipped release-blocker case (the #205 shape) left every other assertion in the file to keep the
// job green. `--no-skips` is the second, complementary gate, and it is opt-in because the PHI job has
// one legitimate skip.
describe('verifyUnitTestReport with --no-skips', () => {
  const named = (name: string, entries: Array<[Status, string]>) => ({
    name: `/home/runner/work/hph-health/${name}`,
    assertionResults: entries.map(([status, fullName]) => ({ status, fullName }))
  })

  it('accepts a report with no skipped cases', () => {
    expect(
      verifyUnitTestReport(report([result(REQUIRED_TEST_FILE, ['passed'])]), { noSkips: true })
    ).toEqual([])
  })

  it('still accepts skips when the flag is not set', () => {
    const withSkip = report([result(REQUIRED_TEST_FILE, ['passed', 'skipped'])])
    expect(verifyUnitTestReport(withSkip)).toEqual([])
  })

  it('names every skipped case instead of counting them', () => {
    const problems = verifyUnitTestReport(
      {
        numTotalTests: 4,
        numPendingTests: 2,
        testResults: [
          named('build/packaging.test.ts', [
            ['passed', 'compiles the preflight (-WX)'],
            ['skipped', 'the preflight compiles before electron-builder declares its variables']
          ]),
          named('build/installer-localization.test.ts', [
            ['skipped', 'provides all three languages'],
            ['passed', 'resolves every custom visible message']
          ])
        ]
      },
      { noSkips: true, required: [] }
    )
    expect(problems).toEqual([
      'SKIP /home/runner/work/hph-health/build/packaging.test.ts > the preflight compiles before electron-builder declares its variables',
      'SKIP /home/runner/work/hph-health/build/installer-localization.test.ts > provides all three languages'
    ])
  })

  it('rejects a report that claims skips it does not list', () => {
    const problems = verifyUnitTestReport(
      { numTotalTests: 1, numPendingTests: 2, testResults: [result(REQUIRED_TEST_FILE, ['passed'])] },
      { noSkips: true }
    )
    expect(problems).toEqual([
      'The report claims 2 skipped or pending tests but lists none of them, so this run cannot prove what did not run.'
    ])
  })
})

// #213: a mixed directory (platform-gated skips) cannot use `--no-skips`, so the skips are named
// instead. Every skip prints; an unlisted one fails; an allowance that stops matching only prints.
describe('--allow-skip', () => {
  const withSkip = {
    numTotalTests: 2,
    numPendingTests: 1,
    testResults: [
      {
        name: '/home/runner/work/hph-health/scripts/ci/mirror-channel-publication.test.ts',
        assertionResults: [
          { status: 'passed', fullName: 'keeps publication isolated' },
          { status: 'skipped', fullName: 'website channel publication preserves bytes' }
        ]
      }
    ]
  }
  const pattern =
    'scripts/ci/mirror-channel-publication.test.ts > website channel publication preserves bytes'

  it('fails a skip that no allowance names', () => {
    const problems = verifyUnitTestReport(withSkip, {
      required: [],
      allowSkips: [{ pattern: 'something else', reason: 'x' }]
    })
    expect(problems).toEqual([
      'UNEXPECTED SKIP /home/runner/work/hph-health/scripts/ci/mirror-channel-publication.test.ts > website channel publication preserves bytes'
    ])
  })

  it('accepts a skip an allowance names, and reports the allowance as unused when it matches nothing', () => {
    expect(
      verifyUnitTestReport(withSkip, { required: [], allowSkips: [{ pattern, reason: 'posix' }] })
    ).toEqual([])
    expect(
      unusedSkipAllowances(withSkip, [{ pattern: 'gone > test', reason: 'stale entry' }])
    ).toEqual([{ pattern: 'gone > test', reason: 'stale entry' }])
    expect(unusedSkipAllowances(withSkip, [{ pattern, reason: 'posix' }])).toEqual([])
  })

  it('prints every skip and every unused allowance through the CLI', () => {
    const directory = mkdtempSync(join(tmpdir(), 'unit-test-guard-'))
    directories.push(directory)
    const allowList = join(directory, 'allow.json')
    writeFileSync(
      allowList,
      JSON.stringify({
        allowed: [
          { pattern, reason: 'publication harness is POSIX-only' },
          { pattern: 'gone > test', reason: 'stale entry' }
        ]
      })
    )
    const reportFile = join(directory, 'results.json')
    writeFileSync(reportFile, JSON.stringify(withSkip))
    const run = spawnSync(
      process.execPath,
      [
        script,
        reportFile,
        '--require',
        'scripts/ci/mirror-channel-publication.test.ts',
        '--allow-skip',
        allowList
      ],
      {
      encoding: 'utf8'
    })
    expect(run.status).toBe(0)
    expect(run.stdout).toContain(
      'SKIP /home/runner/work/hph-health/scripts/ci/mirror-channel-publication.test.ts > website channel publication preserves bytes'
    )
    expect(run.stdout).toContain('UNUSED SKIP ALLOWANCE gone > test: stale entry')
    expect(run.stdout).toContain('allowed skips')
  })
})

// #213 review: `includes('')` is true for every skip, so one malformed entry turned the whole
// allow-list into a blanket amnesty while the run still reported "N allowed skips". Refutation: the
// same skip must pass under a named pattern and fail under a blank one - the only difference is the
// pattern text. A guard that cannot tell those two runs apart is not guarding anything.
describe('--allow-skip refuses a pattern that would match every skip', () => {
  const skipped = {
    numTotalTests: 2,
    numPendingTests: 1,
    testResults: [
      {
        name: '/home/runner/work/hph-health/scripts/ci/mirror-channel-publication.test.ts',
        assertionResults: [
          { status: 'passed', fullName: 'keeps publication isolated' },
          { status: 'skipped', fullName: 'website channel publication preserves bytes' }
        ]
      }
    ]
  }
  const pattern =
    'scripts/ci/mirror-channel-publication.test.ts > website channel publication preserves bytes'

  it('passes the skip when the pattern names it', () => {
    expect(
      verifyUnitTestReport(skipped, { required: [], allowSkips: [{ pattern, reason: 'posix' }] })
    ).toEqual([])
  })

  it('fails the same skip when the pattern is empty, and says why', () => {
    for (const allowance of [
      { pattern: '', reason: 'looks reviewed' },
      { pattern: '   ', reason: 'whitespace' },
      { reason: 'pattern key dropped' },
      {}
    ]) {
      const problems = verifyUnitTestReport(skipped, { required: [], allowSkips: [allowance] })
      expect(problems.join('\n'), JSON.stringify(allowance)).toContain(
        'An --allow-skip entry has an empty pattern, which would match every skip.'
      )
      expect(problems.join('\n'), JSON.stringify(allowance)).toContain(
        'UNEXPECTED SKIP /home/runner/work/hph-health/scripts/ci/mirror-channel-publication.test.ts > website channel publication preserves bytes'
      )
    }
  })

  it('throws from the pattern accessor rather than silently matching', () => {
    expect(() => allowSkipPattern({ pattern: '' })).toThrow('empty pattern')
    expect(() => unusedSkipAllowances(skipped, [{ pattern: '', reason: 'x' }])).toThrow(
      'empty pattern'
    )
  })

  it('exits 2 from the CLI when the allow-list file carries an empty pattern', () => {
    const directory = mkdtempSync(join(tmpdir(), 'unit-test-guard-'))
    directories.push(directory)
    const allowList = join(directory, 'allow.json')
    writeFileSync(
      allowList,
      JSON.stringify({ allowed: [{ pattern: '', reason: 'one bad entry used to disable the gate' }] })
    )
    const run = spawnSync(
      process.execPath,
      [script, writeReport(skipped), '--require', 'scripts/ci/mirror-channel-publication.test.ts', '--allow-skip', allowList],
      { encoding: 'utf8' }
    )
    expect(run.status).toBe(2)
    expect(run.stderr).toContain('FAIL An --allow-skip entry has an empty pattern')
  })

  it('exits 2 from the CLI for an inline empty pattern', () => {
    const run = spawnSync(process.execPath, [script, writeReport(skipped), '--allow-skip', ''], {
      encoding: 'utf8'
    })
    expect(run.status).toBe(2)
    expect(run.stderr).toContain('FAIL An --allow-skip entry has an empty pattern')
  })

  it('exits 2 when --allow-skip is given no value at all', () => {
    const run = spawnSync(process.execPath, [script, writeReport(skipped), '--allow-skip'], {
      encoding: 'utf8'
    })
    expect(run.status).toBe(2)
    expect(run.stderr).toContain('--allow-skip needs a pattern or an allow-list file')
  })

  // The job's own list must not be the reason the gate looks healthy: every entry has to name
  // something, the reason is what makes the skip reviewable, and the header count must match.
  it('every entry in the scripts job allow-list names a skip and gives a reason', () => {
    const list = JSON.parse(
      readFileSync(join(process.cwd(), 'scripts/ci/scripts-job-skip-allowances.json'), 'utf8')
    ) as { count: number; allowed: Array<{ pattern: string; reason: string }> }
    expect(list.count).toBe(list.allowed.length)
    expect(list.allowed.length).toBeGreaterThan(0)
    for (const entry of list.allowed) {
      expect(allowSkipPattern(entry)).toBe(entry.pattern)
      expect(entry.reason.trim().length, entry.pattern).toBeGreaterThan(0)
    }
  })

  it('rejects an allow-list whose header count disagrees with its entries', () => {
    const directory = mkdtempSync(join(tmpdir(), 'unit-test-guard-'))
    directories.push(directory)
    const allowList = join(directory, 'allow.json')
    writeFileSync(
      allowList,
      JSON.stringify({ count: 31, allowed: [{ pattern, reason: 'posix' }] })
    )
    const run = spawnSync(
      process.execPath,
      [script, writeReport(skipped), '--allow-skip', allowList],
      { encoding: 'utf8' }
    )
    expect(run.status).toBe(2)
    expect(run.stderr).toContain('declares 31 allowed skips but lists 1')
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

  it('exits 0 with --no-skips when nothing was skipped', () => {
    const run = spawnSync(
      process.execPath,
      [script, writeReport(report([result(REQUIRED_TEST_FILE, ['passed'])])), '--no-skips'],
      { encoding: 'utf8' }
    )
    expect(run.status).toBe(0)
    expect(run.stdout).toContain('no skips allowed and none found')
  })

  it('exits 1 with --no-skips and names the skipped case', () => {
    const reportWithSkip = {
      numTotalTests: 2,
      numPendingTests: 1,
      testResults: [
        {
          name: '/home/runner/work/hph-health/build/packaging.test.ts',
          assertionResults: [
            { status: 'passed', fullName: 'packages the fallback DOCX' },
            {
              status: 'skipped',
              fullName: 'the preflight compiles before electron-builder declares its variables'
            }
          ]
        }
      ]
    }
    const run = spawnSync(process.execPath, [script, writeReport(reportWithSkip), '--no-skips'], {
      encoding: 'utf8'
    })
    expect(run.status).toBe(1)
    expect(run.stderr).toContain(
      'FAIL SKIP /home/runner/work/hph-health/build/packaging.test.ts > the preflight compiles before electron-builder declares its variables'
    )
  })
})

// #179: an exclusion that no longer names a file is fail-open (the suite quietly starts running again),
// but it still misleads the next reader into thinking the suite is covered somewhere else.
describe('notebook PR exclusions', () => {
  it('names a file that exists', () => {
    for (const pattern of NOTEBOOK_PR_EXCLUDE_PATTERNS) {
      expect(existsSync(join(process.cwd(), pattern)), pattern).toBe(true)
    }
  })
})
