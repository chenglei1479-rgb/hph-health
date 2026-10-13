import { readFileSync } from 'node:fs'
import { readAccountConfig, type AccountConfig } from './config'

// Public deployment configuration only. Passwords and OAuth client secrets never belong here.
export const readDeployedAccountConfig = (
  files: string[],
  env: NodeJS.ProcessEnv = process.env
): AccountConfig | undefined => {
  if (env.DRA_AUTH_MODE || env.DRA_AUTH_ISSUER || env.DRA_AUTH_CLIENT_ID)
    return readAccountConfig(env)
  for (const file of files) {
    let text: string
    try {
      text = readFileSync(file, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw error
    }
    const value: unknown = JSON.parse(text)
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Invalid deployed account configuration.')
    const config = value as Record<string, unknown>
    if (config.mode === 'local') {
      if (Object.keys(config).some((key) => key !== 'mode'))
        throw new Error('Local account configuration must not contain OAuth settings.')
      return undefined
    }
    if (
      Object.keys(config).some(
        (key) =>
          ![
            'mode',
            'issuer',
            'clientId',
            'callbackPort',
            'connections',
            'audience',
            'organization'
          ].includes(key)
      ) ||
      (config.mode !== undefined && config.mode !== 'required' && config.mode !== 'test') ||
      (config.audience !== undefined && typeof config.audience !== 'string') ||
      (config.organization !== undefined && typeof config.organization !== 'string') ||
      typeof config.issuer !== 'string' ||
      !config.issuer.trim() ||
      typeof config.clientId !== 'string' ||
      !config.clientId.trim() ||
      (config.callbackPort !== undefined &&
        (typeof config.callbackPort !== 'number' || !Number.isInteger(config.callbackPort)))
    )
      throw new Error('Invalid deployed account configuration.')
    const connections = config.connections ?? {}
    if (
      !connections ||
      typeof connections !== 'object' ||
      Array.isArray(connections) ||
      Object.entries(connections).some(
        ([key, value]) =>
          !['google', 'microsoft', 'apple', 'institution'].includes(key) ||
          typeof value !== 'string' ||
          !value.trim()
      )
    )
      throw new Error('Invalid deployed account connections.')
    const names = connections as Record<string, string>
    return readAccountConfig({
      DRA_AUTH_ISSUER: config.issuer,
      DRA_AUTH_CLIENT_ID: config.clientId,
      DRA_AUTH_MODE: config.mode === 'test' ? 'test' : 'required',
      DRA_AUTH_AUDIENCE: config.audience as string | undefined,
      DRA_AUTH_ORGANIZATION: config.organization as string | undefined,
      DRA_AUTH_CALLBACK_PORT: String(config.callbackPort ?? 49174),
      DRA_AUTH_GOOGLE_CONNECTION: names.google,
      DRA_AUTH_MICROSOFT_CONNECTION: names.microsoft,
      DRA_AUTH_APPLE_CONNECTION: names.apple,
      DRA_AUTH_INSTITUTION_CONNECTION: names.institution
    })
  }
  return undefined
}
