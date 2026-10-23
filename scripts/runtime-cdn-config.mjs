/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Build-time runtime CDN configuration. The default is deliberately data (not code) so the
// application sources contain no upstream host, while an existing installation keeps downloading
// its Python/R packs until Leo provides a Baselio-hosted base. BASELIO_RUNTIME_CDN_BASE wins,
// including when it is the empty string (which safely disables the runtime downloads).
export const normalizeRuntimeCdnBase = (value) =>
  String(value ?? '')
    .trim()
    .replace(/\/+$/, '')

export const runtimeCdnBuildDefine = (environment = process.env, root = process.cwd()) => {
  const configured = environment.BASELIO_RUNTIME_CDN_BASE
  const fallback = JSON.parse(readFileSync(join(root, 'build/runtime-cdn.json'), 'utf8')).cdnBaseUrl
  return JSON.stringify(normalizeRuntimeCdnBase(configured !== undefined ? configured : fallback))
}
