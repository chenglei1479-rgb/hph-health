import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'

export type CategoricalOptInRecord = {
  at: string
  projectId: string
  tableId: string
  column: string
  actor: string
}

export const createCategoricalOptInLog = (
  filePath: string,
  now: () => Date = () => new Date()
): {
  list: (tableId: string) => CategoricalOptInRecord[]
  optIn: (record: Omit<CategoricalOptInRecord, 'at'>) => CategoricalOptInRecord
} => {
  const read = (): CategoricalOptInRecord[] => {
    let raw: string
    try {
      raw = readFileSync(filePath, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
    return raw
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as CategoricalOptInRecord)
  }
  return {
    list(tableId) {
      return read().filter((record) => record.tableId === tableId)
    },
    optIn(record) {
      const stored: CategoricalOptInRecord = { ...record, at: now().toISOString() }
      mkdirSync(dirname(filePath), { recursive: true })
      appendFileSync(filePath, `${JSON.stringify(stored)}\n`, { encoding: 'utf8', mode: 0o600 })
      return stored
    }
  }
}
