/**
 * Collection sheet consumed by the schema-only Notebook importer.
 * Row 1 is the header (Japanese variable names). Data entry starts on row 2.
 * The importer prefers a sheet with this name and otherwise reads the first sheet.
 */
export const COLLECTION_SHEET_NAME = '収集'

export const DEFINITION_SHEET_NAME = '定義'

export const CANDIDATE_SHEET_NAME = '候補'

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

export type VariableDefinitionTable = {
  projectId: string
  variables: VariableDefinition[]
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
