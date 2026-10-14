import type { AccountLoginMethod } from '../../shared/account'
import { isDraPrerelease } from '../../shared/prerelease'

export type AccountConfig = {
  issuer: string
  clientId: string
  port: number
  audience?: string
  organization?: string
  connections: Partial<Record<AccountLoginMethod, string>>
}

export const readAccountConfig = (
  env: NodeJS.ProcessEnv = process.env
): AccountConfig | undefined => {
  // A beta build must not open an Auth0 tenant even if issuer and client id are present.
  if (isDraPrerelease(env)) return undefined
  if (env.DRA_AUTH_MODE === 'local') {
    if (env.DRA_AUTH_ISSUER || env.DRA_AUTH_CLIENT_ID)
      throw new Error('Local mode must not contain an OAuth tenant.')
    return undefined
  }
  if (env.DRA_AUTH_MODE && env.DRA_AUTH_MODE !== 'required' && env.DRA_AUTH_MODE !== 'test')
    throw new Error('Invalid account mode.')
  if (
    (env.DRA_AUTH_MODE === 'required' || env.DRA_AUTH_MODE === 'test') &&
    (!env.DRA_AUTH_ISSUER || !env.DRA_AUTH_CLIENT_ID)
  )
    throw new Error('Required account mode needs a production tenant.')
  if (!env.DRA_AUTH_ISSUER && !env.DRA_AUTH_CLIENT_ID) return undefined
  const issuer = new URL(env.DRA_AUTH_ISSUER ?? '')
  if (issuer.href.includes('REPLACE_') || env.DRA_AUTH_CLIENT_ID?.includes('REPLACE_'))
    throw new Error('Replace production account template values before deployment.')
  if (
    issuer.protocol !== 'https:' ||
    issuer.username ||
    issuer.password ||
    issuer.pathname !== '/' ||
    issuer.search ||
    issuer.hash ||
    !env.DRA_AUTH_CLIENT_ID?.trim()
  )
    throw new Error('Invalid account configuration.')
  const pinnedTestTenant =
    issuer.href === 'https://dev-s0savnzm2r5rtdvt.us.auth0.com/' &&
    env.DRA_AUTH_CLIENT_ID === 'Rh2MZp3aNDrmGLuI3VHsnNI1mG4SPUqf'
  if (env.DRA_AUTH_MODE === 'test' && !pinnedTestTenant)
    throw new Error('Test login must use the explicitly configured original tenant.')
  if (
    issuer.hostname.startsWith('dev-') &&
    issuer.hostname.endsWith('.auth0.com') &&
    !(env.DRA_AUTH_MODE === 'test' && pinnedTestTenant)
  )
    throw new Error('Development Auth0 tenants are not permitted in this deployment.')
  for (const value of [env.DRA_AUTH_AUDIENCE, env.DRA_AUTH_ORGANIZATION]) {
    if (value !== undefined && (!value.trim() || /[\r\n]/.test(value)))
      throw new Error('Invalid account authorization configuration.')
  }
  const port = Number(env.DRA_AUTH_CALLBACK_PORT ?? '49174')
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('Invalid account callback port.')
  }
  return {
    issuer: issuer.href,
    clientId: env.DRA_AUTH_CLIENT_ID.trim(),
    port,
    audience: env.DRA_AUTH_AUDIENCE,
    organization: env.DRA_AUTH_ORGANIZATION,
    connections: {
      google: env.DRA_AUTH_GOOGLE_CONNECTION || undefined,
      microsoft: env.DRA_AUTH_MICROSOFT_CONNECTION || undefined,
      apple: env.DRA_AUTH_APPLE_CONNECTION || undefined,
      institution: env.DRA_AUTH_INSTITUTION_CONNECTION || undefined
    }
  }
}
