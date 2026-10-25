// Per-project draft for the schema-only analysis panel. The panel used to forget both the imported
// table and the hand-written code as soon as the user left the project. This keeps a stable reference
// to the stored table (its id, never the file contents) plus the code, on this device only.
//
// The table itself lives in the main process (one CSV + one JSON per table id). A stored id can still
// be unreadable later — the project was cleaned up, the app restarted with different storage — so the
// restore path re-reads the context and asks for the file again when that fails.

export type SchemaNotebookDraft = {
  tableId?: string
  filename?: string
  code: string
  language: 'python' | 'r'
}

export const SCHEMA_NOTEBOOK_DEFAULT_CODE =
  'import pandas as pd\ndf = pd.read_csv("table.csv")\nprint(df.shape)'

const KEY_PREFIX = 'dra.schema-notebook.v1.'

/** Storage key for one project's draft. Tests build fixtures through this, not a literal. */
export const schemaNotebookDraftKey = (projectId: string): string => `${KEY_PREFIX}${projectId}`

const CODE_LIMIT = 20_000

const emptyDraft = (): SchemaNotebookDraft => ({
  code: SCHEMA_NOTEBOOK_DEFAULT_CODE,
  language: 'python'
})

export const normalizeSchemaNotebookDraft = (value: unknown): SchemaNotebookDraft => {
  const draft = emptyDraft()
  if (!value || typeof value !== 'object' || Array.isArray(value)) return draft
  const record = value as Record<string, unknown>
  if (typeof record.code === 'string') draft.code = record.code.slice(0, CODE_LIMIT)
  if (record.language === 'python' || record.language === 'r') draft.language = record.language
  if (typeof record.tableId === 'string' && record.tableId.trim().length > 0)
    draft.tableId = record.tableId.trim()
  if (typeof record.filename === 'string' && record.filename.trim().length > 0)
    draft.filename = record.filename.trim()
  return draft
}

export const loadSchemaNotebookDraft = (projectId: string | undefined): SchemaNotebookDraft => {
  if (!projectId) return emptyDraft()
  try {
    const raw = localStorage.getItem(schemaNotebookDraftKey(projectId))
    if (!raw) return emptyDraft()
    return normalizeSchemaNotebookDraft(JSON.parse(raw))
  } catch {
    // A malformed or unreadable draft must not break the analysis panel.
    return emptyDraft()
  }
}

export const saveSchemaNotebookDraft = (
  projectId: string | undefined,
  draft: SchemaNotebookDraft
): SchemaNotebookDraft => {
  const normalized = normalizeSchemaNotebookDraft(draft)
  if (!projectId) return normalized
  try {
    localStorage.setItem(schemaNotebookDraftKey(projectId), JSON.stringify(normalized))
  } catch {
    // Storage can be unavailable (quota, private mode); the panel still works in memory.
  }
  return normalized
}
