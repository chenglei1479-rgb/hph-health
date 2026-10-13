import { readFileSync } from 'node:fs'
import { load } from 'js-yaml'
import {
  parseDraUpdateDeployment,
  type DraUpdateDeployment
} from '../../shared/dra-update-deployment'

export const readDraUpdateDeployment = (file: string): DraUpdateDeployment | undefined => {
  try {
    const config = load(readFileSync(file, 'utf8')) as Record<string, unknown>
    // User-authorized restoration of the original pinned upstream feed.
    // Electron-updater reads this file directly; APP enables the built-in strategy.
    if (config && config.provider === 'generic' &&
      config.url === 'https://statics.aipoch.com/medical-research-agent/app/stable' &&
      config.channel === 'latest' &&
      Object.keys(config).every(key => ['provider', 'url', 'channel', 'updaterCacheDirName'].includes(key))) return undefined
    return parseDraUpdateDeployment(config)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}
