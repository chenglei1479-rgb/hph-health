import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'

import type { PatientDataTag } from '../../../shared/schema-notebook'

export class PatientDataTagError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PatientDataTagError'
  }
}

type TagLine = PatientDataTag

const parseLine = (line: string): TagLine => {
  const parsed: unknown = JSON.parse(line)
  if (!parsed || typeof parsed !== 'object') throw new Error('Patient-data tag log is unreadable.')
  const record = parsed as Partial<TagLine>
  if (
    typeof record.projectId !== 'string' ||
    typeof record.taggedAt !== 'string' ||
    typeof record.reason !== 'string'
  ) {
    throw new Error('Patient-data tag log is unreadable.')
  }
  return { projectId: record.projectId, taggedAt: record.taggedAt, reason: record.reason }
}

/**
 * Append-only. A project that has ever imported patient data stays tagged.
 * There is no removal record: start a new project to work without the badge.
 */
export const createPatientDataTagStore = (
  filePath: string,
  now: () => Date = () => new Date()
): {
  list: () => PatientDataTag[]
  has: (projectId: string) => boolean
  tag: (projectId: string, reason: string) => PatientDataTag
  untag: (projectId: string) => never
} => {
  const read = (): TagLine[] => {
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
      .map(parseLine)
  }
  return {
    list: read,
    has(projectId) {
      return read().some((record) => record.projectId === projectId)
    },
    tag(projectId, reason) {
      const existing = read().find((record) => record.projectId === projectId)
      if (existing) return existing
      const record: TagLine = {
        projectId,
        taggedAt: now().toISOString(),
        reason
      }
      mkdirSync(dirname(filePath), { recursive: true })
      appendFileSync(filePath, `${JSON.stringify(record)}\n`, { encoding: 'utf8', mode: 0o600 })
      return record
    },
    untag(projectId): never {
      throw new PatientDataTagError(
        `Project ${projectId} is tagged contains patient data. The tag cannot be removed; create a new project.`
      )
    }
  }
}
