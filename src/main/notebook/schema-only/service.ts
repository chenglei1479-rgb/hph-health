import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import Papa from 'papaparse'

import type {
  CategoricalOptInRequest,
  ExecuteAnalysisRequest,
  ExecuteAnalysisResponse,
  ImportTableRequest,
  ImportTableResponse,
  PatientDataTag,
  SchemaModelContext
} from '../../../shared/schema-notebook'
import { createCategoricalOptInLog } from './categorical-opt-in'
import { releaseCategoricalValuesForModel } from './categorical-release'
import { executeLocalAnalysis, type CommandRunner } from './local-execute'
import { importTableFile, phiScanText } from './import-table'
import { isHospitalApproved } from './machine-approval'
import { buildSchemaModelContext } from './model-context'
import { createPatientDataTagStore } from './patient-data-tag'
import { findDirectIdentifierColumns } from './identifier-columns'
import { detectPatientPhiSpans, formatBlockedImport } from './patient-phi'
import type { PythonCommand } from '../python-command'
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
  patientDataTags: () => PatientDataTag[]
}

const requireId = (value: string, label: string): string => {
  const trimmed = value.trim()
  if (!trimmed) throw new Error(`${label} is required.`)
  return trimmed
}

const tableToCsv = (table: LocalTable): string =>
  Papa.unparse({ fields: table.columns, data: table.rows })

export const createSchemaNotebookService = (options: {
  directory: string
  approvalLogPath: string
  now?: () => Date
  resolvePython?: () => Promise<PythonCommand>
  resolveR?: () => Promise<PythonCommand | undefined>
  run?: CommandRunner
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

  const readStored = (tableId: string): StoredTable => {
    const parsed: unknown = JSON.parse(readFileSync(join(tableDir, `${tableId}.json`), 'utf8'))
    return parsed as StoredTable
  }

  const readCsv = (tableId: string): string =>
    readFileSync(join(tableDir, `${tableId}.csv`), 'utf8')

  const contextFor = async (stored: StoredTable): Promise<SchemaModelContext> => {
    const withheld = new Set(stored.withheldColumns ?? [])
    const allowed = new Set(optIns.list(stored.tableId).map((record) => record.column))
    const categoricalValues: Record<string, string[]> = {}
    for (const [column, values] of Object.entries(stored.categoricalValues)) {
      if (withheld.has(column) || !allowed.has(column)) continue
      categoricalValues[column] = await releaseCategoricalValuesForModel(values, stored.projectId)
    }
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
      const table = importTableFile(request)
      const spans = detectPatientPhiSpans(phiScanText(request))
      if (spans.length > 0 && !approved()) {
        return { ok: false, blocked: true, message: formatBlockedImport(spans), spans }
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
        identifierWarnings
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
      const stored = readStored(requireId(tableId, 'tableId'))
      if (stored.projectId !== requireId(projectId, 'projectId')) {
        throw new Error('Table does not belong to this project.')
      }
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
      const localRun = await executeLocalAnalysis({
        language: request.language,
        code,
        tableCsv: readCsv(tableId),
        resolvePython: options.resolvePython,
        resolveR: options.resolveR,
        run: options.run
      })
      const error =
        localRun.exitCode !== 0 || localRun.stderr.trim().length > 0
          ? localRun.stderr || localRun.stdout
          : undefined
      // Local stdout stays on the machine. Only this copy is eligible for a model,
      // and only after the row refusal and the provider PHI gate.
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
          exitCode: localRun.exitCode
        },
        forModel
      }
    },
    patientDataTags() {
      return tags.list()
    }
  }
}
