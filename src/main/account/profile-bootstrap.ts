import { lstatSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'

// Runs before Electron profile, credential store, database and account initialization.
export const configureAccountProfile = (
  argv: readonly string[],
  appData: string,
  env: NodeJS.ProcessEnv = process.env
): void => {
  const flags = argv.filter((arg) => arg.startsWith('--dra-profile'))
  const localFlags = argv.filter((arg) => arg.startsWith('--dra-local'))
  if (!flags.length && !localFlags.length) return
  if (
    flags.length !== 1 ||
    !/^--dra-profile=[a-z0-9][a-z0-9-]{0,39}$/.test(flags[0]) ||
    localFlags.length > 1 ||
    (localFlags.length === 1 && localFlags[0] !== '--dra-local')
  ) {
    throw new Error('Use --dra-profile=<lowercase-profile-name> and optionally --dra-local.')
  }
  const id = flags[0].slice('--dra-profile='.length)
  if (Boolean(localFlags.length) !== id.startsWith('local-'))
    throw new Error('Local profiles must use a separate local- prefixed name.')
  if (
    [
      'OPEN_SCIENCE_CONFIG_ROOT',
      'OPEN_SCIENCE_USER_DATA',
      'OPEN_SCIENCE_E2E_STORAGE_ROOT',
      'OPEN_SCIENCE_STORAGE_ROOT'
    ].some((key) => env[key]?.trim())
  ) {
    throw new Error('Named profiles cannot be combined with other storage overrides.')
  }
  const root = env.DRA_PROFILES_ROOT?.trim() || join(appData, 'DRA', 'profiles')
  if (!isAbsolute(root)) throw new Error('DRA_PROFILES_ROOT must be an absolute path.')
  const profile = join(root, 'profile-' + id)
  // A link must not alias another person's config/data/cookie directory.
  let ancestor = profile
  while (true) {
    const stat = lstatSync(ancestor, { throwIfNoEntry: false })
    if (stat && (stat.isSymbolicLink() || !stat.isDirectory()))
      throw new Error('Profile paths must be real directories.')
    if (dirname(ancestor) === ancestor) break
    ancestor = dirname(ancestor)
  }
  env.OPEN_SCIENCE_CONFIG_ROOT = profile
  env.DRA_ACTIVE_PROFILE = id
  if (localFlags.length) {
    if (env.DRA_AUTH_ISSUER || env.DRA_AUTH_CLIENT_ID)
      throw new Error('Remove OAuth environment overrides before starting a local profile.')
    env.DRA_AUTH_MODE = 'local'
  }
}
