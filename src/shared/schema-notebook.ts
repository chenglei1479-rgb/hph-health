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
  /** Stable id of the local rule that fired, e.g. `schema-phone`. The refusal message names it. */
  rule?: string
}

// CSV bytes arrive from the renderer and are decoded in the main process: Excel on a Japanese Windows
// install writes CP932, and decoding as UTF-8 turns every Japanese header into U+FFFD, which also
// defeats the identifier-column and PHI scans that run on the decoded text.
export const SCHEMA_NOTEBOOK_CSV_ENCODING_CODE = 'schema-notebook-csv-encoding' as const

export type CsvEncoding = 'utf-8' | 'utf-8-bom' | 'shift_jis'

export type ImportTableRequest = {
  projectId: string
  filename: string
  // Bytes only. A pre-decoded string would let a caller decode with the wrong encoding again, which is
  // exactly how CP932 headers became U+FFFD and slipped past the identifier and PHI scans.
  /** Raw CSV bytes, base64. The main process decodes them. */
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

// One file a local run produced. It lives in the run's own durable directory under the app data
// folder, so it outlives the run, a project switch, and an app restart (#121). The panel lists these
// and can save a copy through the system dialog.
export type SchemaNotebookRunOutput = {
  /** Path inside the run directory, '/'-separated. Never absolute and never contains '..'. */
  relativePath: string
  sizeBytes: number
  sha256: string
  mimeType: string
}

// A run that finished but whose output file can no longer be read, or whose bytes changed after the
// run recorded their checksum. The panel keeps the row visible and explains the failure instead of
// silently saving the wrong file.
export const SCHEMA_NOTEBOOK_RUN_OUTPUT_MISSING_CODE =
  'schema-notebook-run-output-missing' as const

// The run finished but its output files could not be recorded because a cap was exceeded. The run
// directory is removed before the failure is reported, so nothing is left on disk without a record.
// This code alone carries the caps; a produced file that cannot be read back has its own code below.
export const SCHEMA_NOTEBOOK_RUN_OUTPUT_LIMIT_CODE =
  'schema-notebook-run-output-limit' as const

// A produced file could not be read back after the run (gone, locked, or unreadable). Same cleanup as
// the cap case, but the sentence must not mention the caps: the user did not hit a limit.
export const SCHEMA_NOTEBOOK_RUN_OUTPUT_UNREADABLE_CODE =
  'schema-notebook-run-output-unreadable' as const

export type SaveSchemaNotebookOutputRequest = {
  projectId: string
  runId: string
  relativePath: string
}

// `saved: false` is a cancelled save dialog: a normal outcome, not an error.
export type SaveSchemaNotebookOutputResponse = {
  saved: boolean
}

// One run, as written to `<runs>/<runId>/run.json` at run end. This is the single storage the run
// history and the "computed" counters build on (#121 stores it, #123 reads it). It deliberately keeps
// no stdout, stderr, or head text: those can quote patient rows, and the run record outlives the panel.
export type SchemaNotebookRunRecord = {
  schemaVersion: 1
  runId: string
  projectId: string
  tableId: string
  language: 'python' | 'r'
  startedAt: string
  endedAt: string
  exitCode: number | null
  outputs: SchemaNotebookRunOutput[]
  interpreter?: SchemaNotebookPythonInterpreter
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
    // Local only. Output file names never join `forModel`: a file may be named after a patient.
    outputs: SchemaNotebookRunOutput[]
  }
  forModel: GatedNotebookOutput
  interpreter?: SchemaNotebookPythonInterpreter
  /** Identity of the run that produced `local.outputs`; needed to save a copy later. */
  runId: string
}

export type PatientDataTag = {
  projectId: string
  taggedAt: string
  reason: string
}
