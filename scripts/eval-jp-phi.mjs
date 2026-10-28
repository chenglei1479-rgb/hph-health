import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { exitCodeFor } from './eval-jp-phi-exit.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const reportPath = process.env.PHI_EVAL_REPORT ?? '/tmp/jp-phi-eval-report.json'
// Delete whatever an earlier run left behind before starting this one. Without this
// a run that never writes a report (vitest failing to resolve a module, for example,
// reports "no tests") still prints the previous run's `ok=true` from the stale file,
// which reads as a passing eval. The exit code was already correct; the summary was
// not, so it could report a run that never happened as green.
rmSync(reportPath, { force: true })

const result = spawnSync(
  process.execPath,
  [join(root, 'node_modules/vitest/vitest.mjs'), 'run', 'src/main/phi/dev-eval.test.ts'],
  {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      EVAL_DATE: process.env.EVAL_DATE ?? '2026-10-13',
      PHI_EVAL_REPORT: reportPath
    }
  }
)

const reportPresent = existsSync(reportPath)
let report = null

if (!reportPresent) {
  process.stderr.write(
    `no report was produced: the PHI dev set did not run (vitest exit ${result.status ?? 'unknown'})\n`
  )
} else {
  try {
    report = JSON.parse(readFileSync(reportPath, 'utf8'))
    const patientOverlap = report.patient.overlap.PATIENT
    const patientExact = report.patient.exact.PATIENT
    process.stdout.write(
      `\nPHI dev set EVAL_DATE=${process.env.EVAL_DATE ?? '2026-10-13'} ok=${report.ok}\n`
    )
    process.stdout.write(
      `patient overlap\ttp ${patientOverlap.tp}\tfp ${patientOverlap.fp}\tfn ${patientOverlap.fn}\tP ${patientOverlap.precision}\tR ${patientOverlap.recall}\tF1 ${patientOverlap.f1}\tn ${patientOverlap.n}\n`
    )
    process.stdout.write(
      `patient exact  \ttp ${patientExact.tp}\tfp ${patientExact.fp}\tfn ${patientExact.fn}\tP ${patientExact.precision}\tR ${patientExact.recall}\tF1 ${patientExact.f1}\tn ${patientExact.n}\n`
    )
    for (const category of Object.keys(report.patient.overlap)) {
      if (category === 'PATIENT') continue
      const overlap = report.patient.overlap[category]
      const exact = report.patient.exact[category]
      process.stdout.write(
        `${category}\toverlap R ${overlap.recall} P ${overlap.precision} fn ${overlap.fn}\texact R ${exact.recall} P ${exact.precision} fn ${exact.fn}\tn ${overlap.n}\n`
      )
    }
    const staffRows = [
      ['staff strict overlap', report.physicianOverlap],
      ['staff strict exact  ', report.physicianExact],
      ['staff name overlap  ', report.physicianNameOverlap],
      ['staff name exact    ', report.physicianNameExact]
    ]
    for (const [label, row] of staffRows) {
      process.stdout.write(
        `${label}\tP ${row.precision}\tR ${row.recall}\tF1 ${row.f1}\tfn ${row.fn}\tn ${row.n}\n`
      )
    }
    process.stdout.write(
      `hard recall ${JSON.stringify(report.hardRecall)} age>=90 ${report.ageRecall} replaced ${report.age90Replaced}\n`
    )
    process.stdout.write(
      `decoy ${report.decoyRate} (n ${report.decoyN}) drug+disease ${report.drugDiseaseRate} (n ${report.drugN}) hits ${JSON.stringify(report.decoyHits)}\n`
    )
    process.stdout.write(
      `calendar shifted ${report.calendarShiftRecall} text changed ${report.calendarTextChanged} n ${report.calendarN}; document kept ${report.documentKept} n ${report.documentN}\n`
    )
    process.stdout.write(`misses ${JSON.stringify(report.categoryMisses, null, 2)}\n`)
  } catch (error) {
    report = null
    process.stderr.write(`Could not read PHI eval report: ${error}\n`)
  }
}

// Exit only after the tables above: when `ok` is false those rows are the thing
// that says which threshold slipped, so leaving early would hide the diagnosis.
process.exit(exitCodeFor({ status: result.status, reportPresent, report }))
