import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { load } from 'js-yaml'

import {
  parseDraSigningConfig,
  updatesDisabledBySigningConfig,
  type DraSigningConfig
} from '../../shared/signed-update-channel'

export type LoadedSigningConfig = DraSigningConfig | 'missing' | 'disabled'

const COHORT_FILE = 'update-cohort-id'

export const loadSigningConfigFile = (file: string): LoadedSigningConfig => {
  let raw: string
  try {
    raw = readFileSync(file, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'missing'
    return 'disabled'
  }
  try {
    const config = parseDraSigningConfig(load(raw))
    return updatesDisabledBySigningConfig(config) ? 'disabled' : config
  } catch {
    return 'disabled'
  }
}

// Cohort id for staged rollout. It is random, local, and separate from any telemetry install id.
export const readOrCreateCohortId = (directory: string): string => {
  const file = join(directory, COHORT_FILE)
  try {
    const existing = readFileSync(file, 'utf8').trim()
    if (/^[0-9a-f-]{36}$/i.test(existing)) return existing
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  mkdirSync(directory, { recursive: true })
  const created = randomUUID()
  writeFileSync(file, `${created}\n`, { encoding: 'utf8', mode: 0o600 })
  return created
}
