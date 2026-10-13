import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import { AccountOwner } from './owner'
import { readAccountConfig } from './config'
import { MEMBERSHIP_CLAIM } from '../../shared/membership'
import type { AccountSessionStore, SavedAccountSession } from './session-store'

const owners: AccountOwner[] = []
describe('signed DRA membership', () => {
  it.each([
    ['free', false, false],
    ['plus', true, false],
    ['pro', true, true]
  ] as const)(
    'checks %s through the same host admission guards without running code',
    async (plan, foreground, background) => {
      const f = await fixture({
        claims:
          plan === 'free'
            ? {}
            : {
                [MEMBERSHIP_CLAIM]: { plan, status: 'active', validUntil: Date.now() + 3600000 }
              }
      })
      await f.owner.begin({ method: 'email' })
      await f.complete()
      const result = await f.owner.checkNotebookAccess()
      expect(result.state.membership?.plan).toBe(plan)
      expect(result.foreground.allowed).toBe(foreground)
      expect(result.background.allowed).toBe(background)
      if (!foreground)
        expect(result.foreground.error).toBe('DRA_MEMBERSHIP_REQUIRED:plus:notebook-execution')
      if (!background)
        expect(result.background.error).toBe('DRA_MEMBERSHIP_REQUIRED:pro:background-execution')
      f.owner.logout()
      const signedOut = await f.owner.checkNotebookAccess()
      expect(signedOut.foreground).toEqual({ allowed: false, error: 'DRA account login required.' })
      expect(signedOut.background.allowed).toBe(false)
    }
  )
  it('rechecks signed grant expiry instead of reporting stale successful diagnostics', async () => {
    let now = Date.now()
    const f = await fixture({
      now: () => now,
      claims: { [MEMBERSHIP_CLAIM]: { plan: 'pro', status: 'active', validUntil: now + 60000 } }
    })
    await f.owner.begin({ method: 'email' })
    await f.complete()
    expect((await f.owner.checkNotebookAccess()).background.allowed).toBe(true)
    now += 60001
    const result = await f.owner.checkNotebookAccess()
    expect(result.state.membership).toMatchObject({ plan: 'free', status: 'expired' })
    expect(result.foreground.allowed).toBe(false)
    expect(result.background.allowed).toBe(false)
  })
  it('defaults authenticated users to Free and rejects paid feature calls', async () => {
    const f = await fixture()
    await f.owner.begin({ method: 'email' })
    expect((await f.complete()).status).toBe(200)
    expect(f.owner.snapshot().membership?.plan).toBe('free')
    expect(() => f.owner.assertFeature('notebook-execution')).toThrow(
      'DRA_MEMBERSHIP_REQUIRED:plus'
    )
  })
  it('accepts a signed Plus grant, blocks Pro work and downgrades at expiry without deleting identity', async () => {
    let now = Date.now()
    const f = await fixture({
      now: () => now,
      claims: { [MEMBERSHIP_CLAIM]: { plan: 'plus', status: 'active', validUntil: now + 60000 } }
    })
    await f.owner.begin({ method: 'email' })
    expect((await f.complete()).status).toBe(200)
    expect(() => f.owner.assertFeature('research-package')).not.toThrow()
    expect(() => f.owner.assertFeature('multi-agent')).toThrow('DRA_MEMBERSHIP_REQUIRED:pro')
    now += 60001
    expect(f.owner.snapshot().membership).toMatchObject({ plan: 'free', status: 'expired' })
    expect(f.owner.snapshot().user?.subject).toBe('owner-1')
    expect(() => f.owner.assertFeature('research-package')).toThrow()
  })
  it('allows Pro cumulatively and clears entitlement on logout', async () => {
    const f = await fixture({
      claims: {
        [MEMBERSHIP_CLAIM]: { plan: 'pro', status: 'active', validUntil: Date.now() + 3600000 }
      }
    })
    await f.owner.begin({ method: 'email' })
    await f.complete()
    for (const feature of [
      'notebook-execution',
      'research-package',
      'multi-agent',
      'background-execution',
      'ai-review'
    ] as const)
      expect(() => f.owner.assertFeature(feature)).not.toThrow()
    f.owner.logout()
    expect(f.owner.snapshot().membership).toBeUndefined()
    expect(() => f.owner.assertFeature('ai-review')).toThrow('login required')
  })
  it('does not grant membership from a forged token', async () => {
    const f = await fixture({
      wrongKey: true,
      claims: {
        [MEMBERSHIP_CLAIM]: { plan: 'pro', status: 'active', validUntil: Date.now() + 3600000 }
      }
    })
    await f.owner.begin({ method: 'email' })
    await f.complete()
    expect(f.owner.snapshot().membership).toBeUndefined()
    expect(() => f.owner.assertFeature('multi-agent')).toThrow('login required')
  })
})
afterEach(() => {
  for (const owner of owners.splice(0)) owner.dispose()
})

type Fixture = {
  owner: AccountOwner
  openBrowser: Mock<(url: string) => Promise<void>>
  bindOwner: Mock<() => Promise<boolean>>
  request: typeof fetch
  complete: (state?: string) => Promise<Response>
  authorization: () => URL
  verifier: () => string | null
}

const fixture = async (
  options: {
    claims?: Record<string, unknown>
    bind?: boolean
    now?: () => number
    timeoutMs?: number
    issuer?: string
    audience?: string
    expiry?: string
    wrongKey?: boolean
    sessionStore?: AccountSessionStore
    organization?: string
    apiAudience?: string
  } = {}
): Promise<Fixture> => {
  const listener = createServer()
  await new Promise<void>((resolve) => listener.listen(0, '127.0.0.1', resolve))
  const port = (listener.address() as { port: number }).port
  await new Promise<void>((resolve) => listener.close(() => resolve()))
  const keys = await generateKeyPair('RS256', { extractable: true })
  const wrongKeys = options.wrongKey ? await generateKeyPair('RS256') : keys
  const jwk = { ...(await exportJWK(keys.publicKey)), kid: 'key-1', alg: 'RS256' }
  let authorization: URL
  let verifier: string | null = null
  const openBrowser = vi.fn(async (url: string) => {
    authorization = new URL(url)
  })
  const bindOwner = vi.fn(async () => options.bind ?? true)
  const request = vi.fn(async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
    if (String(url).endsWith('/oauth/token')) {
      verifier = (init?.body as URLSearchParams).get('code_verifier')
      const token = await new SignJWT({
        sub: 'owner-1',
        nonce: authorization.searchParams.get('nonce'),
        email: 'researcher@example.org',
        email_verified: true,
        ...options.claims
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'key-1' })
        .setIssuer(options.issuer ?? 'https://tenant.auth0.com/')
        .setAudience(options.audience ?? 'client-1')
        .setIssuedAt()
        .setExpirationTime(options.expiry ?? '1h')
        .sign(wrongKeys.privateKey)
      return Response.json({ id_token: token })
    }
    return Response.json({ keys: [jwk] })
  }) as unknown as typeof fetch
  const owner = new AccountOwner({
    config: {
      issuer: 'https://tenant.auth0.com/',
      clientId: 'client-1',
      port,
      organization: options.organization,
      audience: options.apiAudience,
      connections: {
        google: 'google-oauth2',
        microsoft: 'windowslive',
        apple: 'apple',
        institution: 'hospital-saml'
      }
    },
    openBrowser,
    bindOwner,
    fetch: request,
    now: options.now,
    timeoutMs: options.timeoutMs,
    sessionStore: options.sessionStore
  })
  owners.push(owner)
  const complete = async (state?: string): Promise<Response> => {
    const url = new URL(`http://127.0.0.1:${port}/account/callback`)
    url.searchParams.set('state', state ?? authorization.searchParams.get('state')!)
    url.searchParams.set('code', 'one-time-code')
    return fetch(url)
  }
  return {
    owner,
    openBrowser,
    bindOwner,
    request,
    complete,
    authorization: () => authorization,
    verifier: () => verifier
  }
}

describe('DRA account configuration', () => {
  it('runs local research admission without identity, refresh, browser or network calls', async () => {
    const request = vi.fn()
    const browser = vi.fn()
    const store = { read: vi.fn(), write: vi.fn(), clear: vi.fn() }
    const owner = new AccountOwner({
      config: readAccountConfig({ DRA_AUTH_MODE: 'local' }),
      fetch: request,
      openBrowser: browser,
      bindOwner: vi.fn(),
      sessionStore: store
    })
    owners.push(owner)
    expect((await owner.getState()).required).toBe(false)
    const access = await owner.checkNotebookAccess()
    expect(access.foreground.allowed).toBe(true)
    expect(access.background.allowed).toBe(true)
    expect(request).not.toHaveBeenCalled()
    expect(browser).not.toHaveBeenCalled()
    expect(store.read).not.toHaveBeenCalled()
  })
  it('uses the configured institution connection and validates organization claims', async () => {
    const f = await fixture({
      organization: 'org_hospital',
      apiAudience: 'https://api.hospital.example',
      claims: { org_id: 'org_other' }
    })
    await f.owner.begin({ method: 'institution' })
    expect(f.authorization().searchParams.get('connection')).toBe('hospital-saml')
    expect(f.authorization().searchParams.get('organization')).toBe('org_hospital')
    expect(f.authorization().searchParams.get('audience')).toBe('https://api.hospital.example')
    expect(f.authorization().searchParams.get('max_age')).toBe('0')
    expect((await f.complete()).status).toBe(400)
    expect(f.owner.snapshot().user).toBeUndefined()
  })
  it('preserves local mode only when auth is entirely unconfigured; partial configuration fails', () => {
    expect(readAccountConfig({})).toBeUndefined()
    expect(() => readAccountConfig({ DRA_AUTH_CLIENT_ID: 'id' })).toThrow()
    for (const issuer of [
      'http://tenant.auth0.com/',
      'https://user:password@tenant.auth0.com/',
      'https://tenant.auth0.com/path',
      'https://tenant.auth0.com/?redirect=evil'
    ]) {
      expect(() =>
        readAccountConfig({ DRA_AUTH_ISSUER: issuer, DRA_AUTH_CLIENT_ID: 'id' })
      ).toThrow()
    }
    expect(() =>
      readAccountConfig({
        DRA_AUTH_ISSUER: 'https://tenant.auth0.com/',
        DRA_AUTH_CLIENT_ID: 'id',
        DRA_AUTH_CALLBACK_PORT: '0'
      })
    ).toThrow()
  })
  it('does not grant access for broken configuration', () => {
    const owner = new AccountOwner({
      configurationError: true,
      openBrowser: vi.fn(),
      bindOwner: vi.fn()
    })
    expect(owner.snapshot()).toMatchObject({
      required: true,
      configured: false,
      error: 'configuration'
    })
    expect(() => owner.assertAccess()).toThrow('login required')
  })
})

describe('persistent account sessions', () => {
  const memory = (): AccountSessionStore & { value?: SavedAccountSession } => ({
    value: undefined,
    read() {
      return this.value
    },
    write(value) {
      this.value = structuredClone(value)
    },
    clear() {
      this.value = undefined
    }
  })
  const restart = (f: Fixture, store: AccountSessionStore, now?: () => number): AccountOwner => {
    const owner = new AccountOwner({
      config: {
        issuer: 'https://tenant.auth0.com/',
        clientId: 'client-1',
        port: 49174,
        connections: {}
      },
      sessionStore: store,
      openBrowser: f.openBrowser,
      bindOwner: f.bindOwner,
      fetch: f.request,
      now
    })
    owners.push(owner)
    return owner
  }
  it('restores verified identity and membership after shutdown without browser or network', async () => {
    const store = memory()
    const f = await fixture({
      sessionStore: store,
      claims: {
        [MEMBERSHIP_CLAIM]: { plan: 'pro', status: 'active', validUntil: Date.now() + 3600000 }
      }
    })
    await f.owner.begin({ method: 'email' })
    await f.complete()
    expect(f.authorization().searchParams.get('scope')).toContain('offline_access')
    expect(f.authorization().searchParams.get('prompt')).toBe('login')
    f.owner.dispose()
    expect(store.value).toBeDefined()
    vi.mocked(f.request).mockClear()
    f.openBrowser.mockClear()
    const next = restart(f, store)
    expect((await next.getState()).user?.subject).toBe('owner-1')
    expect(next.snapshot().membership?.plan).toBe('pro')
    expect(f.request).not.toHaveBeenCalled()
    expect(f.openBrowser).not.toHaveBeenCalled()
    next.logout()
    expect(store.value).toBeUndefined()
    expect((await restart(f, store).getState()).user).toBeUndefined()
  })
  it('rejects changed tenant, forged token, mismatched subject and expired sessions', async () => {
    const store = memory()
    const f = await fixture({ sessionStore: store })
    await f.owner.begin({ method: 'email' })
    await f.complete()
    f.owner.dispose()
    const original = structuredClone(store.value!)
    for (const update of [{ clientId: 'other' }, { subject: 'other' }, { idToken: 'forged' }]) {
      store.value = { ...original, ...update }
      expect((await restart(f, store).getState()).user).toBeUndefined()
    }
    store.value = original
    expect((await restart(f, store, () => Date.now() + 3600001).getState()).user).toBeUndefined()
  })
  it('refreshes expired identity, rotates credentials and reloads signed membership', async () => {
    const store = memory()
    const f = await fixture({ sessionStore: store })
    await f.owner.begin({ method: 'email' })
    await f.complete()
    f.owner.dispose()
    store.value!.refreshToken = 'refresh-old'
    const now = Date.now() + 3600001
    const keys = await generateKeyPair('RS256', { extractable: true })
    const jwk = { ...(await exportJWK(keys.publicKey)), kid: 'rotated', alg: 'RS256' }
    const token = await new SignJWT({
      sub: 'owner-1',
      email: 'researcher@example.org',
      email_verified: true,
      [MEMBERSHIP_CLAIM]: { plan: 'plus', status: 'active', validUntil: now + 3600000 }
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'rotated' })
      .setIssuer('https://tenant.auth0.com/')
      .setAudience('client-1')
      .setIssuedAt(Math.floor(now / 1000))
      .setExpirationTime(Math.floor(now / 1000) + 3600)
      .sign(keys.privateKey)
    vi.mocked(f.request).mockImplementation(async (url, init) => {
      if (String(url).endsWith('/oauth/token')) {
        expect((init!.body as URLSearchParams).get('grant_type')).toBe('refresh_token')
        return Response.json({ id_token: token, refresh_token: 'refresh-new' })
      }
      return Response.json({ keys: [jwk] })
    })
    const next = restart(f, store, () => now)
    const [a, b] = await Promise.all([next.getState(), next.getState()])
    expect(a.user?.subject).toBe('owner-1')
    expect(b.membership?.plan).toBe('plus')
    expect(store.value?.refreshToken).toBe('refresh-new')
    expect(
      vi.mocked(f.request).mock.calls.filter(([url]) => String(url).endsWith('/oauth/token'))
    ).toHaveLength(2) // initial exchange and single refresh
  })
  it('does not restore after sign-out races with identity binding', async () => {
    const store = memory()
    const f = await fixture({ sessionStore: store })
    await f.owner.begin({ method: 'email' })
    await f.complete()
    f.owner.dispose()
    let release!: (value: boolean) => void
    f.bindOwner.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          release = resolve
        })
    )
    const next = restart(f, store)
    const restoring = next.getState()
    await vi.waitFor(() => expect(release).toBeDefined())
    next.logout()
    release(true)
    await restoring
    expect(next.snapshot().user).toBeUndefined()
    expect(store.value).toBeUndefined()
  })
  it('clears revoked refresh credentials and never sends them to the renderer', async () => {
    const store = memory()
    const f = await fixture({ sessionStore: store })
    await f.owner.begin({ method: 'email' })
    await f.complete()
    f.owner.dispose()
    store.value!.refreshToken = 'revoked-refresh-token'
    vi.mocked(f.request).mockImplementation(async () =>
      Response.json({ error: 'invalid_grant' }, { status: 400 })
    )
    const next = restart(f, store, () => Date.now() + 3600001)
    const state = await next.getState()
    expect(state.user).toBeUndefined()
    expect(store.value).toBeUndefined()
    expect(JSON.stringify(state)).not.toContain('refresh-token')
    expect(() => next.assertFeature('multi-agent')).toThrow('login required')
  })
  it('retains encrypted credentials for retry during a temporary network outage', async () => {
    const store = memory()
    const f = await fixture({ sessionStore: store })
    await f.owner.begin({ method: 'email' })
    await f.complete()
    f.owner.dispose()
    store.value!.refreshToken = 'retry-token'
    vi.mocked(f.request).mockClear()
    vi.mocked(f.request).mockImplementation(async () => {
      throw new Error('offline')
    })
    const next = restart(f, store, () => Date.now() + 3600001)
    expect((await next.getState()).user).toBeUndefined()
    expect(store.value?.refreshToken).toBe('retry-token')
    await next.getState()
    expect(f.request).toHaveBeenCalledOnce()
  })
})

describe('DRA account authorization', () => {
  it.each([
    { issuer: 'https://attacker.example/' },
    { audience: 'different-client' },
    { expiry: '-1h' },
    { wrongKey: true }
  ])('rejects forged, misissued or expired tokens: %j', async (options) => {
    const f = await fixture(options)
    await f.owner.begin({ method: 'email' })
    expect((await f.complete()).status).toBe(400)
    expect(f.owner.snapshot().user).toBeUndefined()
    expect(f.bindOwner).not.toHaveBeenCalled()
  })
  it('requires login, validates a signed identity, uses PKCE, and locks again after logout', async () => {
    const f = await fixture()
    expect(() => f.owner.assertAccess()).toThrow('login required')
    expect((await f.owner.begin({ method: 'email', signup: true })).pending).toBe(true)
    const url = f.authorization()
    expect(url.searchParams.get('screen_hint')).toBe('signup')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.has('client_secret')).toBe(false)
    expect((await f.complete()).status).toBe(200)
    expect(url.searchParams.get('code_challenge')).toBe(
      createHash('sha256').update(f.verifier()!).digest('base64url')
    )
    expect(f.owner.snapshot()).toMatchObject({
      user: { subject: 'owner-1', email: 'researcher@example.org' }
    })
    expect(() => f.owner.assertAccess()).not.toThrow()
    expect(JSON.stringify(f.owner.snapshot())).not.toContain('id_token')
    f.owner.logout()
    expect(() => f.owner.assertAccess()).toThrow('login required')
  })
  it.each(['google', 'microsoft', 'apple'] as const)(
    'routes %s to the configured provider',
    async (method) => {
      const f = await fixture()
      await f.owner.begin({ method })
      expect(f.authorization().searchParams.get('connection')).toBe(
        { google: 'google-oauth2', microsoft: 'windowslive', apple: 'apple' }[method]
      )
    }
  )
  it('ignores a forged callback without consuming the genuine login attempt', async () => {
    const f = await fixture()
    await f.owner.begin({ method: 'email' })
    expect((await f.complete('forged-state')).status).toBe(400)
    expect(f.request).not.toHaveBeenCalled()
    expect(f.owner.snapshot().pending).toBe(true)
    expect((await f.complete()).status).toBe(200)
  })
  it.each([
    [{ azp: 'different-client' }, 'login'],
    [{ nonce: 'wrong' }, 'login'],
    [{ email_verified: false }, 'email-unverified'],
    [{ email_verified: undefined }, 'email-unverified'],
    [{ email: undefined }, 'email-unverified']
  ] as const)('rejects invalid identity claims %j', async (claims, error) => {
    const f = await fixture({ claims })
    await f.owner.begin({ method: 'email' })
    expect((await f.complete()).status).toBe(400)
    expect(f.owner.snapshot()).toMatchObject({ error, pending: false })
    expect(f.bindOwner).not.toHaveBeenCalled()
    expect(() => f.owner.assertAccess()).toThrow()
  })
  it('prevents a different identity from accessing the local dataset', async () => {
    const f = await fixture({ bind: false })
    await f.owner.begin({ method: 'email' })
    expect((await f.complete()).status).toBe(400)
    expect(f.owner.snapshot().error).toBe('different-owner')
    expect(() => f.owner.assertAccess()).toThrow()
  })
  it('expires the session using the signed token expiry', async () => {
    let now = Date.now()
    const f = await fixture({ now: () => now })
    await f.owner.begin({ method: 'email' })
    expect((await f.complete()).status).toBe(200)
    now += 60 * 60 * 1000 + 1000
    expect(f.owner.snapshot().user).toBeUndefined()
    expect(() => f.owner.assertAccess()).toThrow()
  })
  it('does not grant a session when logout occurs during token exchange', async () => {
    const f = await fixture()
    const original = f.request
    vi.mocked(original).mockImplementationOnce(async () => {
      f.owner.logout()
      return Response.json({ id_token: 'cancelled' })
    })
    await f.owner.begin({ method: 'email' })
    await f.complete().catch(() => undefined)
    expect(f.owner.snapshot().user).toBeUndefined()
  })
  it('deduplicates repeated login clicks and closes abandoned callbacks after timeout', async () => {
    const f = await fixture({ timeoutMs: 80 })
    await f.owner.begin({ method: 'email' })
    await f.owner.begin({ method: 'google' })
    expect(f.openBrowser).toHaveBeenCalledOnce()
    await vi.waitFor(() =>
      expect(f.owner.snapshot()).toMatchObject({ pending: false, error: 'timeout' })
    )
    await expect(f.complete()).rejects.toThrow()
  })
})
