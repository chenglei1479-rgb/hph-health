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
 * `--no-skips` (opt-in, per job) adds a fourth: the run must not have skipped anything at all.
 *
 * Why it is opt-in rather than the default: `--require` proves a file ran, not that the case that
 * matters inside it ran. A suite can keep one executed assertion and skip the release-blocker case
 * behind `it.skipIf(envMissing)`, which is exactly the #205 shape - the probe existed, the thing it
 * guarded never ran, and the job was green. Jobs that measured zero skips can say so; jobs with a
 * legitimate skip (the real-Electron-window PHI case) must not, which is why this is a flag and not
 * a rule.
 *
 * A requirement may be a file or a directory; a directory matches any result inside it.
 *
 * Usage: node scripts/ci/require-unit-test-results.mjs <vitest-json-report> [--require <path>]...
 *        [--no-skips]
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

// Named, not counted: a gate that reports "1 skipped" without saying which case leaves the next person
// reading the whole log to find out what did not run.
export const skippedAssertions = (report) =>
  (Array.isArray(report?.testResults) ? report.testResults : []).flatMap((result) =>
    (Array.isArray(result?.assertionResults) ? result.assertionResults : [])
      .filter((assertion) => SKIPPED_STATUSES.has(String(assertion?.status)))
      .map((assertion) => ({
        file: normalized(result?.name),
        name: String(assertion?.fullName ?? assertion?.title ?? '(unnamed test)')
      }))
  )

// A directory with legitimate platform skips cannot use `--no-skips` without either going red or
// loosening it. `--allow-skip` names the skips instead: every one is printed, an unlisted skip fails,
// and an allowance that stops matching anything is printed so the list cannot rot in silence. Being
// visible rather than fatal matters - a fatal unused entry would lock the allow-list to the code, and
// the next person would delete entries to get green instead of reading them.
export const skipKey = (entry) => `${entry.file} > ${entry.name}`

export const unusedSkipAllowances = (report, allowSkips = []) => {
  const skipped = skippedAssertions(report).map(skipKey)
  return allowSkips.filter(
    (allowance) => !skipped.some((key) => key.includes(String(allowance.pattern)))
  )
}

export function verifyUnitTestReport(
  report,
  { required = [REQUIRED_TEST_FILE], noSkips = false, allowSkips = [] } = {}
) {
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
  if (noSkips) {
    const skipped = skippedAssertions(report)
    // The count and the per-assertion statuses come from the same report, so a report that claims
    // skips it does not list is a shape change, not a pass.
    const reportedPending = Number(report.numPendingTests ?? 0)
    if (skipped.length === 0 && Number.isFinite(reportedPending) && reportedPending > 0)
      problems.push(
        `The report claims ${reportedPending} skipped or pending tests but lists none of them, ` +
          'so this run cannot prove what did not run.'
      )
    for (const entry of skipped) problems.push(`SKIP ${entry.file} > ${entry.name}`)
  } else if (allowSkips.length > 0) {
    for (const entry of skippedAssertions(report)) {
      const key = skipKey(entry)
      if (!allowSkips.some((allowance) => key.includes(String(allowance.pattern))))
        problems.push(`UNEXPECTED SKIP ${key}`)
    }
  }
  return problems
}

const USAGE =
  'Usage: node scripts/ci/require-unit-test-results.mjs <vitest-json-report> [--require <path>]...\n' +
  '       [--no-skips] [--allow-skip <pattern|allow-list.json>]...'

// An allow-list file is `{ "allowed": [{ "pattern": "scripts/… > test name", "reason": "…" }] }`. The
// reason is carried so the next reader knows why the skip is legitimate; a pattern without one would
// just be a quieter way of hiding it.
const readAllowList = (file) => {
  const parsed = JSON.parse(readFileSync(resolve(file), 'utf8'))
  const allowed = Array.isArray(parsed?.allowed) ? parsed.allowed : []
  return allowed.map((entry) => ({
    pattern: String(entry.pattern ?? ''),
    reason: String(entry.reason ?? '')
  }))
}

const parseArgs = (argv) => {
  const positional = []
  const required = []
  const allowSkips = []
  let noSkips = false
  for (let index = 2; index < argv.length; index++) {
    const value = argv[index]
    if (value === '--require' && argv[index + 1]) required.push(argv[++index])
    else if (value === '--allow-skip' && argv[index + 1]) {
      const target = argv[++index]
      if (target.endsWith('.json')) allowSkips.push(...readAllowList(target))
      else allowSkips.push({ pattern: target, reason: '' })
    } else if (value === '--no-skips') noSkips = true
    else if (!value.startsWith('--')) positional.push(value)
  }
  return {
    file: positional[0],
    required: required.length ? required : [REQUIRED_TEST_FILE],
    noSkips,
    allowSkips
  }
}

const main = () => {
  const { file, required, noSkips, allowSkips } = parseArgs(process.argv)
  if (!file) {
    console.error(USAGE)
    process.exit(2)
  }
  let report
  try {
    report = JSON.parse(readFileSync(resolve(file), 'utf8'))
  } catch (error) {
    console.error(`Unit-test evidence is unreadable at ${file}: ${error.message}`)
    process.exit(1)
  }
  // Printed whether or not they are allowed: a skip nobody can see is how a gate rots.
  for (const entry of skippedAssertions(report)) console.log(`SKIP ${skipKey(entry)}`)
  for (const allowance of unusedSkipAllowances(report, allowSkips))
    console.log(`UNUSED SKIP ALLOWANCE ${allowance.pattern}: ${allowance.reason || '(no reason)'}`)

  const problems = verifyUnitTestReport(report, { required, noSkips, allowSkips })
  if (problems.length) {
    for (const problem of problems) console.error(`FAIL ${problem}`)
    process.exit(1)
  }
  console.log(
    `Unit tests executed: ${executedTestCount(report)} assertions across ${report.testResults.length} files ` +
      `(reported total ${report.numTotalTests}); required paths present: ${required.join(', ')}` +
      `${noSkips ? '; no skips allowed and none found' : ''}` +
      `${allowSkips.length ? `; ${skippedAssertions(report).length} allowed skips` : ''}.`
  )
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
