// Schema-only Notebook contracts shared by the main process and the renderer.
// Patient rows never travel on this type: samples are synthetic, and categorical
// values appear only after an explicit opt-in.

export const SCHEMA_NOTEBOOK_LOCAL_FILENAME = 'table.csv'

export const COLLECTION_SHEET_NAME = '収集'

export type SchemaDtype = 'integer' | 'number' | 'binary' | 'categorical' | 'text' | 'date'

export type SchemaColumn = {
  name: string
  dtype: SchemaDtype
}

export type SchemaModelContext = {
  mode: 'schema-only'
  tableId: string
  rowCount: number
  columns: SchemaColumn[]
  syntheticSampleRows: string[][]
  syntheticSampleNote: string
  categoricalValues?: Record<string, string[]>
  localFilename: typeof SCHEMA_NOTEBOOK_LOCAL_FILENAME
}

export type PatientPhiSpan = {
  start: number
  end: number
  category: string
  text: string
  reason: string
}

export type ImportTableRequest = {
  projectId: string
  filename: string
  csvText?: string
  xlsxBase64?: string
  /** Defaults to true. A table with detected patient PHI is always patient data. */
  patientData?: boolean
}

export type IdentifierColumnWarning = {
  column: string
  category: string
  message: string
}

export type ImportTableResponse =
  | {
      ok: true
      context: SchemaModelContext
      containsPatientData: boolean
      tagged: boolean
      identifierWarnings: IdentifierColumnWarning[]
    }
  | {
      ok: false
      blocked: true
      message: string
      spans: PatientPhiSpan[]
    }

export type CategoricalOptInRequest = {
  projectId: string
  tableId: string
  column: string
  actor?: string
}

export type ExecuteAnalysisRequest = {
  projectId: string
  tableId: string
  language: 'python' | 'r'
  code: string
}

export type GatedNotebookOutput = {
  error?: string
  stdout?: string
  head?: string
  table?: string
}

export type ExecuteAnalysisResponse = {
  local: {
    stdout: string
    stderr: string
    exitCode: number | null
  }
  forModel: GatedNotebookOutput
}

export type PatientDataTag = {
  projectId: string
  taggedAt: string
  reason: string
}
