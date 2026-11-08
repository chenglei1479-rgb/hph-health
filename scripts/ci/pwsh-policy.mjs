/* eslint-disable @typescript-eslint/explicit-function-return-type */

// #221: `pwsh` may legitimately be absent on a developer machine, so the two real-shell cases are
// named skips there (scripts/ci/scripts-job-skip-allowances.json). A job that *declares* PowerShell 7
// must not inherit that tolerance: a silent skip on a runner whose contract says pwsh exists is the
// "green but nobody looked" shape this repository keeps paying for. The decision is a pure function so
// the `fail` branch can be asserted on a machine that does have pwsh.
//
// The variable name is exported for the same reason: the job sets it, the suite reads it, and the guard
// checks both. Three references to one constant cannot drift the way three copies of a string can.
export const PWSH_EXPECT_ENV = 'OPEN_SCIENCE_EXPECT_PWSH'
export const PWSH_MISSING_CODE = 'CI-PWSH-MISSING-01'
// The stable id is part of the message on purpose: a thrown code is only a property, while the message
// is what reaches the CI log, and that log is where somebody searches for this failure.
export const PWSH_MISSING_MESSAGE =
  'OPEN_SCIENCE_EXPECT_PWSH=1 but pwsh is not on PATH; install PowerShell 7 or unset the variable [CI-PWSH-MISSING-01]'

/**
 * run  : pwsh is present, execute the real-shell cases.
 * skip : nobody asked for pwsh and it is absent - a named skip, listed in the allow-list.
 * fail : the job declared pwsh and it is absent - red, never a skip.
 * @returns {'run' | 'skip' | 'fail'}
 */
export function resolvePwshPolicy({ pwshAvailable, expectPwsh }) {
  if (pwshAvailable) return 'run'
  return expectPwsh ? 'fail' : 'skip'
}

/**
 * Turns the `fail` branch into the one thing a test suite may do about it: throw. Separate from the
 * pure function so the throw itself is unit-testable without changing the machine's PATH.
 */
export function assertPwshExpectation(policy) {
  if (policy !== 'fail') return
  const error = new Error(PWSH_MISSING_MESSAGE)
  error.code = PWSH_MISSING_CODE
  throw error
}

/** Reads the declaration from an environment bag, so callers never spell the variable out. */
export function expectsPwsh(environment = {}) {
  return environment[PWSH_EXPECT_ENV] === '1'
}
