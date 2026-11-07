import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, resolve, sep, relative as relativePath } from 'node:path'

import Papa from 'papaparse'
import { createLogger } from '@aipoch/diagnostics/node'

import {
  SCHEMA_NOTEBOOK_RUN_OUTPUT_MISSING_CODE,
  SCHEMA_NOTEBOOK_TABLE_MISSING_CODE,
  type CategoricalOptInRequest,
  type ExecuteAnalysisRequest,
  type ExecuteAnalysisResponse,
  type ImportTableRequest,
  type ImportTableResponse,
  type PatientDataTag,
  type SaveSchemaNotebookOutputRequest,
  type SaveSchemaNotebookOutputResponse,
  type SchemaModelContext,
  type SchemaNotebookRunRecord
} from '../../../shared/schema-notebook'
import { ApplicationCommandError } from '../../../shared/application-command-contract'
import { createCategoricalOptInLog } from './categorical-opt-in'
import { releaseCategoricalValuesForModel } from './categorical-release'
import {
  executeLocalAnalysis,
  RUN_METADATA_DIRECTORY,
  RUN_RECORD_FILENAME,
  schemaNotebookRunDirectory,
  type CommandRunner
} from './local-execute'
import { readTableInput } from './import-table'
import { isHospitalApproved } from './machine-approval'
import { buildSchemaModelContext } from './model-context'
import { createPatientDataTagStore } from './patient-data-tag'
import { findDirectIdentifierColumns } from './identifier-columns'
import { detectPatientPhiSpans, formatBlockedImport } from './patient-phi'
import type { PythonCommand } from '../python-command'
import { desktopFileInteraction } from '../../desktop-interaction'
import { gateNotebookOutputs } from './release-model-text'
import { profileTable, type LocalTable } from './schema-profile'
import {
  isMentorDiscussionPack,
  MENTOR_PACK_TABLE_REFUSAL
} from '../../../shared/deliverable-pack-policy'

type StoredTable = {
  projectId: string
  tableId: string
  columns: SchemaModelContext['columns']
  rowCount: number
  categoricalValues: Record<string, string[]>
  withheldColumns: string[]
}

export type SchemaNotebookService = {
  importTable: (request: ImportTableRequest) => Promise<ImportTableResponse>
  optInCategorical: (request: CategoricalOptInRequest) => Promise<SchemaModelContext>
  modelContext: (projectId: string, tableId: string) => Promise<SchemaModelContext>
  execute: (request: ExecuteAnalysisRequest) => Promise<ExecuteAnalysisResponse>
  saveOutput: (request: SaveSchemaNotebookOutputRequest) => Promise<SaveSchemaNotebookOutputResponse>
  // The newest recorded run for a table, or null. Reading the same record `execute` wrote is what lets
  // the panel show a figure again after the app restarts (#121); run history and counters stay in #123.
  lastRun: (projectId: string, tableId: string) => Promise<SchemaNotebookRunRecord | null>
  patientDataTags: () => PatientDataTag[]
}

// The save dialog is a desktop capability. Injecting it keeps this module runnable in the Node
// backend and in tests, the same way `resolvePython` and `run` are injected.
export type ChooseRunOutputSavePath = (options: {
  defaultPath: string
  filters?: Array<{ name: string; extensions: string[] }>
}) => Promise<{ canceled: boolean; filePath?: string }>

const requireId = (value: string, label: string): string => {
  const trimmed = value.trim()
  if (!trimmed) throw new Error(`${label} is required.`)
  return trimmed
}

const tableToCsv = (table: LocalTable): string =>
  Papa.unparse({ fields: table.columns, data: table.rows })

// Output paths arrive from the renderer, so they are untrusted: only a plain relative path inside the
// run directory is accepted, never an absolute path and never a `..` segment.
const normalizeRunOutputPath = (value: string): string => {
  const unified = value.trim().replaceAll('\\', '/')
  const segments = unified.split('/').filter((part) => part !== '' && part !== '.')
  if (
    segments.length === 0 ||
    unified.startsWith('/') ||
    /^[A-Za-z]:/.test(unified) ||
    segments.includes('..')
  ) {
    throw new Error('Invalid run output path.')
  }
  return segments.join('/')
}

const saveFiltersFor = (
  relativePath: string
): Array<{ name: string; extensions: string[] }> | undefined => {
  const extension = extname(relativePath).toLowerCase().replace(/^\./, '')
  return extension === '' ? undefined : [{ name: extension.toUpperCase(), extensions: [extension] }]
}

const defaultChooseSavePath: ChooseRunOutputSavePath = (request) =>
  desktopFileInteraction().chooseSavePath(request)

export const createSchemaNotebookService = (options: {
  directory: string
  approvalLogPath: string
  now?: () => Date
  resolvePython?: () => Promise<PythonCommand>
  resolveR?: () => Promise<PythonCommand | undefined>
  run?: CommandRunner
  chooseSavePath?: ChooseRunOutputSavePath
  machineApproved?: () => boolean
  readAgentContext?: (projectId: string) => Promise<string | undefined> | string | undefined
}): SchemaNotebookService => {
  const tags = createPatientDataTagStore(
    join(options.directory, 'patient-data-tags.jsonl'),
    options.now
  )
  const optIns = createCategoricalOptInLog(
    join(options.directory, 'categorical-opt-in.jsonl'),
    options.now
  )
  const tableDir = join(options.directory, 'tables')
  const approved = options.machineApproved ?? (() => isHospitalApproved(options.approvalLogPath))

  const writeTable = (tableId: string, csv: string, stored: StoredTable): void => {
    mkdirSync(tableDir, { recursive: true })
    writeFileSync(join(tableDir, `${tableId}.csv`), csv, { encoding: 'utf8', mode: 0o600 })
    writeFileSync(join(tableDir, `${tableId}.json`), JSON.stringify(stored), {
      encoding: 'utf8',
      mode: 0o600
    })
  }

  // One durable directory per run holds everything the script wrote (#121). The run record is the
  // single source of truth for the output list: the panel saves a copy against it, and the run history
  // in #123 reads the same file. Since #162 it also holds the run's own code, the input hash and the
  // complete local stdout/stderr, so a restart no longer loses the result. That text stays on this
  // device on the same terms as the output files beside it: `lastRun` is a LOCAL-only command and the
  // record never contributes to `forModel`.
  const runsDirectory = join(options.directory, 'runs')
  const now = options.now ?? (() => new Date())

  const runRecordPath = (runId: string): string =>
    join(
      schemaNotebookRunDirectory(runsDirectory, runId),
      RUN_METADATA_DIRECTORY,
      RUN_RECORD_FILENAME
    )

  const missingOutputError = (message?: string): ApplicationCommandError =>
    new ApplicationCommandError(
      SCHEMA_NOTEBOOK_RUN_OUTPUT_MISSING_CODE,
      message ??
        'The files from that run are no longer on this device. Run the analysis again to create them.'
    )

  const readRunRecord = (runId: string): SchemaNotebookRunRecord => {
    let raw: string
    try {
      raw = readFileSync(runRecordPath(runId), 'utf8')
    } catch {
      throw missingOutputError()
    }
    try {
      return JSON.parse(raw) as SchemaNotebookRunRecord
    } catch {
      throw missingOutputError()
    }
  }

  const writeRunRecord = (record: SchemaNotebookRunRecord): void => {
    const path = runRecordPath(record.runId)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify(record, null, 2), { encoding: 'utf8', mode: 0o600 })
  }

  // Run ids start with the sortable ISO timestamp, so a reverse name sort is newest-first without
  // reading a single record. The cap bounds how many files one panel open can touch.
  const listRunIdsNewestFirst = (): string[] => {
    try {
      return readdirSync(runsDirectory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
        .reverse()
        .slice(0, 200)
    } catch {
      return []
    }
  }

  const schemaNotebookLog = createLogger('schema-notebook')

  const tableFile = (tableId: string, extension: 'csv' | 'json'): string =>
    join(tableDir, `${tableId}.${extension}`)

  const isUnreadableTableFileError = (error: unknown): boolean =>
    Boolean(
      error &&
      typeof error === 'object' &&
      'code' in error &&
      ['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM', 'EISDIR'].includes(String(error.code))
    )

  // A stored table is a metadata file plus a csv file. Restoring must notice either one becoming
  // unusable (deleted, locked by another process, or replaced by a directory), and running must fail
  // with a stable code instead of surfacing a Node errno and a local absolute path. Only the relative
  // file shape is logged; the home directory never reaches the log.
  const unreadableTableFile = (tableId: string, extension: 'csv' | 'json'): never => {
    schemaNotebookLog.warn('stored table file unreadable', {
      code: SCHEMA_NOTEBOOK_TABLE_MISSING_CODE,
      tableId,
      file: `tables/<tableId>.${extension}`
    })
    throw new ApplicationCommandError(
      SCHEMA_NOTEBOOK_TABLE_MISSING_CODE,
      'The imported table file is missing or unreadable. Nothing was run.'
    )
  }

  const requireTableFile = (tableId: string, extension: 'csv' | 'json'): string => {
    const path = tableFile(tableId, extension)
    try {
      // A directory passes a plain existence check but cannot be read as a table.
      if (!statSync(path).isFile()) unreadableTableFile(tableId, extension)
    } catch (error) {
      if (!isUnreadableTableFileError(error)) throw error
      unreadableTableFile(tableId, extension)
    }
    return path
  }

  const readTableFile = (tableId: string, extension: 'csv' | 'json'): string => {
    const path = requireTableFile(tableId, extension)
    try {
      return readFileSync(path, 'utf8')
    } catch (error) {
      // stat can succeed and the read still fail (a lock, a permission change, a directory).
      if (!isUnreadableTableFileError(error)) throw error
      return unreadableTableFile(tableId, extension)
    }
  }

  const readStored = (tableId: string): StoredTable =>
    JSON.parse(readTableFile(tableId, 'json')) as StoredTable

  const readCsv = (tableId: string): string => readTableFile(tableId, 'csv')

  const contextFor = async (stored: StoredTable): Promise<SchemaModelContext> => {
    const withheld = new Set(stored.withheldColumns ?? [])
    const allowed = new Set(optIns.list(stored.tableId).map((record) => record.column))
    const categoricalValues: Record<string, string[]> = {}
    for (const [column, values] of Object.entries(stored.categoricalValues)) {
      if (withheld.has(column) || !allowed.has(column)) continue
      categoricalValues[column] = await releaseCategoricalValuesForModel(values, stored.projectId)
    }
    // This local preview is not a send. The complete context is released again at the
    // provider HTTP boundary, including names, dtypes, samples, and opted-in values.
    return buildSchemaModelContext({
      tableId: stored.tableId,
      rowCount: stored.rowCount,
      columns: stored.columns.filter((column) => !withheld.has(column.name)),
      categoricalValues
    })
  }

  return {
    async importTable(request) {
      const projectId = requireId(request.projectId, 'projectId')
      if (
        options.readAgentContext &&
        isMentorDiscussionPack(await options.readAgentContext(projectId))
      ) {
        return {
          ok: false,
          blocked: true,
          message: MENTOR_PACK_TABLE_REFUSAL,
          spans: []
        }
      }
      // One decode feeds both the schema and the PHI scan, so an encoding mistake cannot silently
      // change what the gate sees.
      const imported = readTableInput(request)
      const table = imported.table
      const spans = detectPatientPhiSpans(imported.scanText)
      if (spans.length > 0 && !approved()) {
        // The refusal names the categories and offsets; the matched text stays in this process. The
        // renderer has no use for it and must not receive patient values.
        return {
          ok: false,
          blocked: true,
          message: formatBlockedImport(spans),
          spans: spans.map((span) => ({ ...span, text: '' }))
        }
      }
      const profile = profileTable(table)
      const identifierWarnings = findDirectIdentifierColumns(table.columns, table.rows)
      const patient =
        request.patientData !== false || spans.length > 0 || identifierWarnings.length > 0
      if (patient) tags.tag(projectId, 'imported patient table')
      const tableId = randomUUID()
      const categoricalValues: Record<string, string[]> = Object.fromEntries(
        [...profile.categoricalValues].map(([column, values]) => [column, [...values]])
      )
      const stored: StoredTable = {
        projectId,
        tableId,
        columns: profile.columns,
        rowCount: profile.rowCount,
        categoricalValues,
        withheldColumns: identifierWarnings.map((warning) => warning.column)
      }
      writeTable(tableId, tableToCsv(table), stored)
      return {
        ok: true,
        context: await contextFor(stored),
        containsPatientData: patient,
        tagged: tags.has(projectId),
        identifierWarnings,
        ...(imported.encoding === undefined ? {} : { encoding: imported.encoding })
      }
    },
    async optInCategorical(request) {
      const projectId = requireId(request.projectId, 'projectId')
      const tableId = requireId(request.tableId, 'tableId')
      const column = requireId(request.column, 'column')
      const stored = readStored(tableId)
      if (stored.projectId !== projectId) throw new Error('Table does not belong to this project.')
      if ((stored.withheldColumns ?? []).includes(column)) {
        throw new Error(`Column ${column} is a direct identifier and is not sent to the model.`)
      }
      const meta = stored.columns.find((item) => item.name === column)
      if (meta?.dtype === 'text') {
        throw new Error('自由記述の列はモデルに渡せません。')
      }
      if (!stored.categoricalValues[column]) {
        throw new Error(`Column ${column} has no categorical value list.`)
      }
      optIns.optIn({
        projectId,
        tableId,
        column,
        actor: request.actor?.trim() || 'user'
      })
      return contextFor(stored)
    },
    async modelContext(projectId, tableId) {
      const id = requireId(tableId, 'tableId')
      const stored = readStored(id)
      if (stored.projectId !== requireId(projectId, 'projectId')) {
        throw new Error('Table does not belong to this project.')
      }
      // The panel must not look restored when the csv is gone; the renderer shows its restore notice
      // when this call fails.
      requireTableFile(id, 'csv')
      return contextFor(stored)
    },
    async execute(request) {
      const projectId = requireId(request.projectId, 'projectId')
      const tableId = requireId(request.tableId, 'tableId')
      const code = request.code
      if (!code.trim()) throw new Error('Code is required.')
      if (request.language !== 'python' && request.language !== 'r') {
        throw new Error('Language must be python or r.')
      }
      const stored = readStored(tableId)
      if (stored.projectId !== projectId) throw new Error('Table does not belong to this project.')
      requireTableFile(tableId, 'csv')
      // Sortable and unique, so the run history in #123 can order runs without reading every record.
      const startedAt = now()
      const runId = `run-${startedAt.toISOString().replace(/[:.]/gu, '-')}-${randomUUID().slice(0, 8)}`
      // Read the input once: the same string is written into the run directory for the script, so its
      // hash names the exact bytes the result came from (#162).
      const tableCsv = readCsv(tableId)
      const inputSha256 = createHash('sha256').update(tableCsv, 'utf8').digest('hex')
      const localRun = await executeLocalAnalysis({
        language: request.language,
        code,
        tableCsv,
        runId,
        runsDirectory,
        resolvePython: options.resolvePython,
        resolveR: options.resolveR,
        run: options.run
      })
      // The record is written before the response leaves, because a run the panel can list but the
      // history cannot is exactly the state this ticket removes. A failed write therefore fails the
      // run instead of returning a list nothing points at.
      writeRunRecord({
        schemaVersion: 2,
        runId: localRun.runId,
        projectId,
        tableId,
        language: request.language,
        startedAt: startedAt.toISOString(),
        endedAt: now().toISOString(),
        exitCode: localRun.exitCode,
        code,
        inputSha256,
        // Complete local output, so reopening the project shows the result without a re-run. The runner
        // caps it and appends `[truncated]`, so a capped record never claims to be the whole output.
        stdout: localRun.stdout,
        stderr: localRun.stderr,
        outputs: localRun.outputs,
        ...(localRun.interpreter === undefined ? {} : { interpreter: localRun.interpreter })
      })
      const error =
        localRun.exitCode !== 0 || localRun.stderr.trim().length > 0
          ? localRun.stderr || localRun.stdout
          : undefined
      // Local stdout stays on the machine. Only this copy is eligible for a model,
      // and only after the row refusal and the provider PHI gate. Output file names stay local too:
      // a name can carry a patient name even when the bytes are already masked.
      const forModel = await gateNotebookOutputs(
        {
          ...(error === undefined ? {} : { error }),
          ...(localRun.stdout.length > 0 ? { stdout: localRun.stdout } : {}),
          ...(localRun.head === undefined ? {} : { head: localRun.head }),
          ...(localRun.table === undefined ? {} : { table: localRun.table })
        },
        projectId
      )
      return {
        local: {
          stdout: localRun.stdout,
          stderr: localRun.stderr,
          exitCode: localRun.exitCode,
          outputs: localRun.outputs
        },
        forModel,
        ...(localRun.interpreter === undefined ? {} : { interpreter: localRun.interpreter }),
        runId: localRun.runId
      }
    },
    async saveOutput(request) {
      const projectId = requireId(request.projectId, 'projectId')
      const runId = requireId(request.runId, 'runId')
      // Validated before the record read, so a traversal attempt is reported as an invalid id instead
      // of being folded into the "no longer on this device" message.
      const runDirectory = schemaNotebookRunDirectory(runsDirectory, runId)
      const record = readRunRecord(runId)
      if (record.projectId !== projectId) throw new Error('That run does not belong to this project.')
      const target = normalizeRunOutputPath(request.relativePath)
      const output = record.outputs.find((item) => item.relativePath === target)
      if (!output) {
        throw missingOutputError(
          'That file is not part of this run. Run the analysis again to create it.'
        )
      }
      const absolute = resolve(runDirectory, target)
      const inside = relativePath(runDirectory, absolute)
      if (inside === '' || inside === '..' || inside.startsWith(`..${sep}`)) {
        throw new Error('Invalid run output path.')
      }
      let bytes: Buffer
      try {
        bytes = readFileSync(absolute)
      } catch {
        throw missingOutputError()
      }
      // The dialog only saves the bytes this run recorded. A file that changed on disk is reported,
      // never saved under the run's checksum: that would make the saved copy unverifiable.
      if (
        bytes.byteLength !== output.sizeBytes ||
        createHash('sha256').update(bytes).digest('hex') !== output.sha256
      ) {
        throw missingOutputError(
          'That file changed after the run finished, so it was not saved. Run the analysis again.'
        )
      }
      const filters = saveFiltersFor(target)
      const selected = await (options.chooseSavePath ?? defaultChooseSavePath)({
        defaultPath: target.includes('/') ? target.slice(target.lastIndexOf('/') + 1) : target,
        ...(filters === undefined ? {} : { filters })
      })
      // A cancelled dialog is a normal outcome, not a failure.
      if (selected.canceled || !selected.filePath) return { saved: false }
      writeFileSync(selected.filePath, bytes)
      return { saved: true }
    },
    patientDataTags() {
      return tags.list()
    },
    async lastRun(requestProjectId, requestTableId) {
      const projectId = requireId(requestProjectId, 'projectId')
      const tableId = requireId(requestTableId, 'tableId')
      for (const runId of listRunIdsNewestFirst()) {
        let record: SchemaNotebookRunRecord
        try {
          record = JSON.parse(readFileSync(runRecordPath(runId), 'utf8')) as SchemaNotebookRunRecord
        } catch {
          // A record that cannot be read is not the panel's problem; keep looking for an older one.
          continue
        }
        if (record.projectId === projectId && record.tableId === tableId) return record
      }
      return null
    }
  }
}
