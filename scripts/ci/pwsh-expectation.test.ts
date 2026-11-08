import { readFileSync } from 'node:fs'

import { load } from 'js-yaml'
import { describe, expect, it } from 'vitest'

import {
  PWSH_EXPECT_ENV,
  PWSH_MISSING_CODE,
  PWSH_MISSING_MESSAGE,
  assertPwshExpectation,
  expectsPwsh,
  resolvePwshPolicy
} from './pwsh-policy.mjs'

// #221: "pwsh is missing" may be a skip on a developer machine, but a job that declares PowerShell 7
// must not tolerate it. This machine has no `pwsh`, so `run` and `skip` can only be asserted through
// the pure function; `fail` is not hypothetical here - with OPEN_SCIENCE_EXPECT_PWSH=1 the
// unconditional assertion in the diagnostics suite goes red with CI-PWSH-MISSING-01.
describe('resolvePwshPolicy', () => {
  it.each([
    [{ pwshAvailable: true, expectPwsh: true }, 'run'],
    [{ pwshAvailable: true, expectPwsh: false }, 'run'],
    [{ pwshAvailable: false, expectPwsh: false }, 'skip'],
    [{ pwshAvailable: false, expectPwsh: true }, 'fail']
  ])('%o resolves to %s', (input, expected) => {
    expect(resolvePwshPolicy(input)).toBe(expected)
  })

  it('reads the declaration through the shared variable name', () => {
    expect(expectsPwsh({ [PWSH_EXPECT_ENV]: '1' })).toBe(true)
    expect(expectsPwsh({})).toBe(false)
    // A near-miss name must not count: the job and the suite have to agree exactly.
    expect(expectsPwsh({ EXPECT_PWSH: '1' })).toBe(false)
  })
})

describe('assertPwshExpectation', () => {
  it.each(['run', 'skip'])('does nothing for %s', (policy) => {
    expect(() => assertPwshExpectation(policy)).not.toThrow()
  })

  it('throws - never skips - when the declaration is unmet', () => {
    expect(() => assertPwshExpectation('fail')).toThrow(PWSH_MISSING_MESSAGE)
    try {
      assertPwshExpectation('fail')
      expect.unreachable('fail must throw')
    } catch (error) {
      expect((error as Error & { code?: string }).code).toBe(PWSH_MISSING_CODE)
      // The stable id travels in the message so it is searchable in the CI log, not only as a property.
      expect(PWSH_MISSING_MESSAGE).toContain(PWSH_MISSING_CODE)
    }
  })
})

// #212: a guard has to cover the call sites, not just the function. The job sets the variable and the
// suite reads it; both sides go through the exported constant, so renaming it half-way cannot stay
// green. This file is the third reference and lives in scripts/ci so the scripts job runs it.
describe('the scripts job declares PowerShell 7 and the suite reads it', () => {
  const workflowText = readFileSync('.github/workflows/pr-unit-tests.yml', 'utf8')
  const workflow = load(workflowText) as {
    jobs: Record<string, { env?: Record<string, string> }>
  }
  const diagnostics = readFileSync('scripts/ci/run-windows-browser-diagnostics.test.ts', 'utf8')

  it('sets the variable at job level, so the guard and the suite share one environment', () => {
    expect(workflow.jobs['unit-tests-scripts']?.env).toMatchObject({ [PWSH_EXPECT_ENV]: '1' })
  })

  it('spells the name from the constant, so a rename reds both sides', () => {
    expect(workflowText).toContain(PWSH_EXPECT_ENV)
    // A hardcoded string in the suite would drift from the job even while this guard stayed green.
    expect(diagnostics).toContain('expectsPwsh(process.env)')
    expect(diagnostics).not.toContain("process.env.OPEN_SCIENCE_EXPECT_PWSH")
  })
})
