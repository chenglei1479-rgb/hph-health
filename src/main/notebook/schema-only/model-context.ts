import {
  SCHEMA_NOTEBOOK_LOCAL_FILENAME,
  type SchemaColumn,
  type SchemaModelContext
} from '../../../shared/schema-notebook'
import { syntheticSampleRows } from './synthetic-sample'

export const SYNTHETIC_SAMPLE_NOTE =
  'These rows were generated from the column names and dtypes. They are not copied from the table.'

export const buildSchemaModelContext = (input: {
  tableId: string
  rowCount: number
  columns: readonly SchemaColumn[]
  categoricalValues?: Record<string, string[]>
}): SchemaModelContext => {
  const context: SchemaModelContext = {
    mode: 'schema-only',
    tableId: input.tableId,
    rowCount: input.rowCount,
    columns: input.columns.map((column) => ({ name: column.name, dtype: column.dtype })),
    syntheticSampleRows: syntheticSampleRows(input.columns),
    syntheticSampleNote: SYNTHETIC_SAMPLE_NOTE,
    localFilename: SCHEMA_NOTEBOOK_LOCAL_FILENAME
  }
  if (input.categoricalValues && Object.keys(input.categoricalValues).length > 0) {
    context.categoricalValues = input.categoricalValues
  }
  return context
}
