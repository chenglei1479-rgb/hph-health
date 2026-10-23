declare const __BASELIO_RUNTIME_CDN_BASE__: string | undefined

// The runtime download base is baked at build time by electron.vite.config.ts and
// scripts/build-backend.mjs. An empty value means "no runtime CDN": R1/R2 must fail closed without
// making any request. The source tree contains no upstream host; the temporary build default lives
// in build/runtime-cdn.json until the Baselio-hosted base exists.
export const normalizeRuntimeCdnBase = (value: string): string => value.trim().replace(/\/+$/, '')

export const builtRuntimeCdnBase = (): string =>
  normalizeRuntimeCdnBase(
    typeof __BASELIO_RUNTIME_CDN_BASE__ === 'string' ? __BASELIO_RUNTIME_CDN_BASE__ : ''
  )
