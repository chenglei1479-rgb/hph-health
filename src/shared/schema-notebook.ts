// Schema-only Notebook contracts shared by the main process and the renderer.
// Patient rows never travel on this type: samples are synthetic, and categorical
// values appear only after an explicit opt-in.

export const SCHEMA_NOTEBOOK_LOCAL_FILENAME = 'table.csv'

// Stable code for a stored table whose metadata or csv file disappeared. The main process reports it
// instead of leaking ENOENT and an absolute local path to the panel.
export const SCHEMA_NOTEBOOK_TABLE_MISSING_CODE = 'schema-notebook-table-missing' as const

// The installer ships an offline Python for the Notebook. When that interpreter exists but cannot
// start (blocked by antivirus, missing DLL, corrupt install) the analysis stops with this code
// instead of falling back to a Python on PATH that usually lacks the statistical packages.
export const SCHEMA_NOTEBOOK_PYTHON_UNAVAILABLE_CODE = 'schema-notebook-python-unavailable' as const

export const COLLECTION_SHEET_NAME = '収集'

export type SchemaDtype = 'integer' | 'number' | 'binary' | 'categorical' | 'text' | 'date'

// Which interpreter ran a local script. `bundled` is the offline prefix shipped in the installer;
// `system` means the app fell back to a Python on PATH, which may not carry the statistical
// packages. The panel shows this so the fallback is never silent.
export type SchemaNotebookPythonInterpreter = {
  source: 'bundled' | 'system'
  version: string
}

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

// CSV bytes arrive from the renderer and are decoded in the main process: Excel on a Japanese Windows
// install writes CP932, and decoding as UTF-8 turns every Japanese header into U+FFFD, which also
// defeats the identifier-column and PHI scans that run on the decoded text.
export const SCHEMA_NOTEBOOK_CSV_ENCODING_CODE = 'schema-notebook-csv-encoding' as const

export type CsvEncoding = 'utf-8' | 'utf-8-bom' | 'shift_jis'

export type ImportTableRequest = {
  projectId: string
  filename: string
  csvText?: string
  /** Raw CSV bytes, base64. Preferred over `csvText`: the main process decodes them. */
  csvBase64?: string
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
      /** How a CSV was decoded, so the panel can show it before the user trusts the columns. */
      encoding?: CsvEncoding
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
  interpreter?: SchemaNotebookPythonInterpreter
}

export type PatientDataTag = {
  projectId: string
  taggedAt: string
  reason: string
}
