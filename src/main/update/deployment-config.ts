import { readFileSync } from 'node:fs'
import { load } from 'js-yaml'
import {
  isExplicitlyDisabledDraUpdate,
  parseDraUpdateDeployment,
  type DraUpdateDeploymentRead
} from '../../shared/dra-update-deployment'

// A missing file is `missing` so the caller can apply the build default. An explicit
// `enabled: false` is `disabled` and must not fall through to that default.
export const readDraUpdateDeployment = (file: string): DraUpdateDeploymentRead => {
  try {
    const parsed = parseDraUpdateDeployment(load(readFileSync(file, 'utf8')))
    if (isExplicitlyDisabledDraUpdate(parsed)) return { state: 'disabled' }
    return { state: 'configured', deployment: parsed }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { state: 'missing' }
    throw error
  }
}
