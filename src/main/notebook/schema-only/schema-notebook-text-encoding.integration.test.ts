import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

import { afterAll, describe, expect, it } from 'vitest'

import { createSchemaNotebookService } from './service'

// #158: the panel showed "�ձ��Z..." where a cell printed Japanese. The child wrote its ANSI code page
// (GBK on a Chinese install, CP932 on a Japanese one) into a pipe the host decodes as UTF-8. These
// assertions compare characters, never a stored mojibake sample, so reintroducing the mismatch fails
// here instead of being blessed as expected output.
const PRINTED = '日本語出力確認：架空研究'
const ERROR = '日本語エラー'

const bundledPython = join(
  process.cwd(),
  'resources',
  'schema-notebook-python',
  'win-x64',
  'python.exe'
)
// The same gate the figure test uses: the contract is only runnable where the runtime is installed.
const pythonAvailable = process.platform === 'win32' && existsSync(bundledPython)

const CSV = ['区分,値', '研究,10', '対照,20'].join('\n')

const runDirectories: string[] = []

afterAll(async () => {
  for (const directory of runDirectories.splice(0)) {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined)
  }
})

// #156: this suite used to keep its run directory in `<checkout>/.scratch/vitest-tmp`, because a
// developer sandbox can forbid the interpreter writing into the OS temp dir. Tests must not write into
// the checkout, so the root is `os.tmpdir()` again; where the interpreter genuinely cannot write there
// the suite skips with this line instead of leaving files in the worktree.
//
// Neither this machine nor the notebook unit-test job executes these assertions. The bundled interpreter
// (`resources/schema-notebook-python/**`) is gitignored, and that job only checks out, installs and runs
// vitest, so `pythonAvailable` is false there too and the suite skips. Running it needs a job that stages
// the bundled interpreter first; that coverage gap belongs with the CI-coverage tickets (#192/#202), not
// with this isolation change.
const interpreterCanWriteTempDir = (): boolean => {
  if (!pythonAvailable) return false
  let probe: string | undefined
  try {
    probe = mkdtempSync(join(tmpdir(), 'schema-notebook-encoding-probe-'))
    const target = join(probe, 'probe.txt')
    const result = spawnSync(
      bundledPython,
      ['-c', `open(${JSON.stringify(target)}, 'w').write('ok')`],
      { timeout: 30_000 }
    )
    return result.status === 0 && existsSync(target)
  } catch {
    return false
  } finally {
    if (probe) rmSync(probe, { recursive: true, force: true })
  }
}

const tempRootWritable = interpreterCanWriteTempDir()
if (!pythonAvailable) {
  console.warn(
    '[schema-notebook] skipping the text-encoding suite: the bundled interpreter is not present here. resources/schema-notebook-python/** is gitignored and the notebook unit-test job does not stage it, so this case runs only where the interpreter has been staged (#156).'
  )
} else if (!tempRootWritable) {
  console.warn(
    '[schema-notebook] skipping the text-encoding suite: the bundled interpreter cannot write inside the OS temp directory on this machine, and the suite must not write into the checkout (#156).'
  )
}

const notebookFor = async (): Promise<{
  notebook: ReturnType<typeof createSchemaNotebookService>
  directory: string
  tableId: string
}> => {
  const directory = await mkdtemp(join(tmpdir(), 'schema-notebook-encoding-'))
  runDirectories.push(directory)
  const notebook = createSchemaNotebookService({
    directory,
    approvalLogPath: join(directory, 'machine-approval.jsonl'),
    resolvePython: async () => ({ command: bundledPython, baseArgs: [] })
  })
  const imported = await notebook.importTable({
    projectId: 'project-encoding',
    filename: 'study.csv',
    csvBase64: Buffer.from(CSV, 'utf8').toString('base64'),
    patientData: false
  })
  if (!imported.ok) throw new Error(`import blocked: ${imported.message}`)
  return { notebook, directory, tableId: imported.context.tableId }
}

describe.skipIf(!tempRootWritable)('Japanese text survives a local run as UTF-8', () => {
  it('prints Japanese, keeps the columns and values it computed with, and writes a UTF-8 file', async () => {
    const { notebook, directory, tableId } = await notebookFor()
    const executed = await notebook.execute({
      projectId: 'project-encoding',
      tableId,
      language: 'python',
      code: [
        'import os',
        'import pandas as pd',
        "df = pd.read_csv(os.environ['DRA_SCHEMA_TABLE'])",
        `print(${JSON.stringify(PRINTED)})`,
        'print(list(df.columns))',
        "print(df['区分'].tolist())",
        `open('report.txt', 'w').write(${JSON.stringify(PRINTED)})`
      ].join('\n')
    })

    expect(executed.local.exitCode).toBe(0)
    // Panel text, the exact characters the reporter could not read.
    expect(executed.local.stdout).toContain(PRINTED)
    expect(executed.local.stdout).toContain("['区分', '値']")
    expect(executed.local.stdout).toContain("['研究', '対照']")
    expect(executed.local.stdout).not.toContain('\ufffd')

    // A file the script opened without an encoding is UTF-8, not the ANSI code page.
    const bytes = await readFile(join(directory, 'runs', executed.runId, 'report.txt'))
    expect(bytes.toString('hex')).toBe(Buffer.from(PRINTED, 'utf8').toString('hex'))
    expect(bytes.toString('utf8')).toBe(PRINTED)
  })

  it('keeps a Japanese error message intact', async () => {
    const { notebook, tableId } = await notebookFor()
    const executed = await notebook.execute({
      projectId: 'project-encoding',
      tableId,
      language: 'python',
      code: `raise ValueError(${JSON.stringify(ERROR)})`
    })

    expect(executed.local.exitCode).not.toBe(0)
    expect(executed.local.stderr).toContain(`ValueError: ${ERROR}`)
    expect(executed.local.stderr).not.toContain('\ufffd')
  })
})
