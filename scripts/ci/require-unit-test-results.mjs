/*
 * #150: a PR unit-test job has to prove it executed tests, not just exit 0.
 *
 * `vitest run <path>` exits 0 whenever its filters match *something*, so a narrowed filter, a config
 * change or a renamed file can leave the job green while the suites that matter never ran. This
 * script reads the Vitest JSON report and fails unless:
 *
 *   1. the report exists and parses,
 *   2. at least one test assertion actually executed (skipped ones do not count),
 *   3. every required path ran with at least one executed assertion. The default requirement is
 *      `src/main/application-command-composition.test.ts`, the incident from #134/#149: an
 *      unregistered application command kept that inventory suite red for a day while PR CI had no
 *      unit-test job at all.
 *
 * A requirement may be a file or a directory; a directory matches any result inside it.
 *
 * Usage: node scripts/ci/require-unit-test-results.mjs <vitest-json-report> [--require <path>]...
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const REQUIRED_TEST_FILE = 'src/main/application-command-composition.test.ts'

const SKIPPED_STATUSES = new Set(['pending', 'skipped', 'todo', 'disabled'])

const normalized = (value) => String(value).split('\\').join('/')

const matchesRequirement = (result, requirement) => {
  const path = normalized(result?.name)
  const wanted = normalized(requirement)
    .replace(/^\.?\//u, '')
    .replace(/\/$/u, '')
  return path.endsWith(`/${wanted}`) || path.includes(`/${wanted}/`)
}

// A collected-but-skipped assertion proves nothing about the code under test.
export const executedAssertionCount = (result) =>
  (Array.isArray(result?.assertionResults) ? result.assertionResults : []).filter(
    (assertion) => !SKIPPED_STATUSES.has(String(assertion?.status))
  ).length

export const executedTestCount = (report) =>
  (Array.isArray(report?.testResults) ? report.testResults : []).reduce(
    (total, result) => total + executedAssertionCount(result),
    0
  )

export function verifyUnitTestReport(report, { required = [REQUIRED_TEST_FILE] } = {}) {
  if (!report || typeof report !== 'object')
    return ['The Vitest JSON report is missing or unreadable.']
  const problems = []
  const results = Array.isArray(report.testResults) ? report.testResults : []
  const reportedTotal = Number(report.numTotalTests ?? 0)
  if (!Number.isFinite(reportedTotal) || reportedTotal <= 0)
    problems.push('The run collected no tests at all.')
  if (executedTestCount(report) <= 0) problems.push('The run executed no test assertions.')
  for (const requirement of required) {
    const matched = results.filter((result) => matchesRequirement(result, requirement))
    if (matched.length === 0) problems.push(`${requirement} did not run.`)
    else if (matched.every((result) => executedAssertionCount(result) === 0))
      problems.push(`${requirement} ran but executed no assertions.`)
  }
  return problems
}

const requirements = () => {
  const values = []
  for (let index = 2; index < process.argv.length; index++) {
    if (process.argv[index] === '--require' && process.argv[index + 1])
      values.push(process.argv[++index])
  }
  return values.length ? values : [REQUIRED_TEST_FILE]
}

const main = () => {
  const file = process.argv[2] && process.argv[2] !== '--require' ? process.argv[2] : undefined
  if (!file) {
    console.error(
      'Usage: node scripts/ci/require-unit-test-results.mjs <vitest-json-report> [--require <path>]...'
    )
    process.exit(2)
  }
  let report
  try {
    report = JSON.parse(readFileSync(resolve(file), 'utf8'))
  } catch (error) {
    console.error(`Unit-test evidence is unreadable at ${file}: ${error.message}`)
    process.exit(1)
  }
  const required = requirements()
  const problems = verifyUnitTestReport(report, { required })
  if (problems.length) {
    for (const problem of problems) console.error(`FAIL ${problem}`)
    process.exit(1)
  }
  console.log(
    `Unit tests executed: ${executedTestCount(report)} assertions across ${report.testResults.length} files ` +
      `(reported total ${report.numTotalTests}); required paths present: ${required.join(', ')}.`
  )
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
