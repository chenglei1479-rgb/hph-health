/**
 * Collection sheet consumed by the schema-only Notebook importer.
 * Row 1 is the header (Japanese variable names). Data entry starts on row 2.
 * The importer prefers a sheet with this name and otherwise reads the first sheet.
 */
export const COLLECTION_SHEET_NAME = '収集'

export const DEFINITION_SHEET_NAME = '定義'

export const CANDIDATE_SHEET_NAME = '候補'

export const NOTES_SHEET_NAME = '注意'

/** First column of every collection template. It is not a chart number. */
export const RESEARCH_ID_COLUMN_NAME = '研究用ID'

/**
 * Shown on the notes sheet. The research-ID to chart-number key stays in the
 * hospital-designated location, and this workbook is still hospital personal data.
 */
export const COLLECTION_TEMPLATE_NOTES = [
  '研究用IDとカルテ番号の対応表は、病院が指定した場所に別に保管してください。このファイルには入れないでください。',
  'このファイルは病院にとって個人情報です。匿名データとして院外に持ち出してはいけません。'
] as const

export const VARIABLE_DEFINITION_TYPES = [
  'integer',
  'number',
  'binary',
  'categorical',
  'date',
  'text'
] as const

export type VariableDefinitionType = (typeof VARIABLE_DEFINITION_TYPES)[number]

export type VariableDefinition = {
  name: string
  definition: string
  recordType: string
  coding: string
  type: VariableDefinitionType
  allowedRange: string
}

export type VariableDefinitionWarningCode = 'dropped-identifier' | 'raw-date'

export type VariableDefinitionWarning = {
  code: VariableDefinitionWarningCode
  name: string
  message: string
}

export type VariableDefinitionTable = {
  projectId: string
  variables: VariableDefinition[]
  warnings: VariableDefinitionWarning[]
}

export type GenerateVariableDefinitionRequest = {
  projectId: string
  researchPlan: string
}

export type ExportVariableDefinitionRequest = {
  table: VariableDefinitionTable
}

export type ExportVariableDefinitionResponse = {
  filename: string
  xlsxBase64: string
}

/**
 * Separated from the home deliverable-packages flow until PR #8 merges.
 * After that PR lands, add `id` to `DELIVERABLE_PACKAGE_IDS` in
 * src/renderer/src/pages/home/deliverable-packages.ts and offer it on
 * MedicalResearchLaunchpad step 2 next to mentor-pack, consultation-pack,
 * and writing-pack. This module does not edit that flow.
 */
export const VARIABLE_DEFINITION_TEMPLATE_OPTION = {
  id: 'variable-definition-template',
  integratesWith: 'src/renderer/src/pages/home/deliverable-packages.ts',
  deliverablePackageIdsAfterMerge: [
    'mentor-pack',
    'consultation-pack',
    'writing-pack',
    'variable-definition-template'
  ]
} as const
