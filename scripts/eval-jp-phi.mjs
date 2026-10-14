import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const reportPath = process.env.PHI_EVAL_REPORT ?? '/tmp/jp-phi-eval-report.json'
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

try {
  const report = JSON.parse(readFileSync(reportPath, 'utf8'))
  const line = (label, row) =>
    `${label}\ttp ${row.tp}\tfp ${row.fp}\tfn ${row.fn}\tP ${row.precision}\tR ${row.recall}\tF1 ${row.f1}\tn ${row.n}`
  process.stdout.write(`\nPHI dev set EVAL_DATE=${process.env.EVAL_DATE ?? '2026-10-13'} ok=${report.ok}\n`)
  process.stdout.write(`${line('patient overlap', report.patient.overlap.PATIENT)}\n`)
  process.stdout.write(`${line('patient exact  ', report.patient.exact.PATIENT)}\n`)
  for (const category of Object.keys(report.patient.overlap)) {
    if (category === 'PATIENT') continue
    const overlap = report.patient.overlap[category]
    const exact = report.patient.exact[category]
    process.stdout.write(
      `${category}\toverlap R ${overlap.recall} P ${overlap.precision} fn ${overlap.fn}\texact R ${exact.recall} P ${exact.precision} fn ${exact.fn}\tn ${overlap.n}\n`
    )
  }
  process.stdout.write(
    `hard recall ${JSON.stringify(report.hardRecall)} age>=90 ${report.ageRecall} replaced ${report.age90Replaced}\n`
  )
  process.stdout.write(
    `decoy ${report.decoyRate} (n ${report.decoyN}) drug+disease ${report.drugDiseaseRate} (n ${report.drugN})\n`
  )
  process.stdout.write(
    `calendar shifted ${report.calendarShiftRecall} text changed ${report.calendarTextChanged} n ${report.calendarN}; document kept ${report.documentKept} n ${report.documentN}\n`
  )
  process.stdout.write(`misses ${JSON.stringify(report.categoryMisses, null, 2)}\n`)
} catch (error) {
  process.stderr.write(`Could not read PHI eval report: ${error}\n`)
}

process.exit(result.status ?? 1)
