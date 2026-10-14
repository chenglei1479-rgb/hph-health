import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { createLocalJWKSet, jwtVerify, type JSONWebKeySet, type JWTPayload } from 'jose'
import type {
  AccountConsentNotice,
  AccountLoginRequest,
  AccountState,
  NotebookAccessCheck
} from '../../shared/account'
import type { AccountConsentStore } from './consent'
import type { AccountConfig } from './config'
import { isDraPrerelease } from '../../shared/prerelease'
import { idTokenStillValid, jwksCacheFresh, rsaKeyThumbprints, sameThumbprints } from './jwks-pin'
import type { AccountJwksPin, AccountSessionStore, SavedAccountSession } from './session-store'
import {
  MEMBERSHIP_CLAIM,
  MEMBERSHIP_MINIMUM,
  membershipAllows,
  membershipFromVerifiedClaim,
  type MembershipFeature
} from '../../shared/membership'

type Attempt = {
  state: string
  nonce: string
  verifier: string
  server?: Server
  timer?: ReturnType<typeof setTimeout>
  consuming: boolean
  abort: AbortController
}
type Dependencies = {
  profile?: string
  config?: AccountConfig
  configurationError?: boolean
  consent?: AccountConsentNotice
  consentError?: boolean
  terms?: AccountConsentNotice
  termsError?: boolean
  consentStore?: AccountConsentStore
  openBrowser: (url: string) => Promise<void>
  bindOwner: (identity: { issuer: string; subject: string }) => Promise<boolean>
  fetch?: typeof fetch
  now?: () => number
  timeoutMs?: number
  sessionStore?: AccountSessionStore
}

const sameSecret = (left: string, right: string): boolean => {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

export class AccountOwner {
  private attempt?: Attempt
  private user?: AccountState['user']
  private expiresAt?: number
  private membershipClaim?: unknown
  private error?: AccountState['error']
  private readonly now: () => number
  private readonly request: typeof fetch
  private recovery?: Promise<void>
  private revision = 0
  private retryAfter = 0
  private disposed = false

  async getState(): Promise<AccountState> {
    const state = this.snapshot()
    if (
      !this.disposed &&
      !this.attempt &&
      this.deps.sessionStore &&
      this.deps.config &&
      (!state.user || (state.expiresAt ?? 0) - this.now() < 60_000) &&
      this.now() >= this.retryAfter
    ) {
      if (!this.recovery)
        this.recovery = this.recover().finally(() => {
          this.recovery = undefined
        })
      await this.recovery
    }
    return this.snapshot()
  }

  private cachedKeysTrusted(saved: SavedAccountSession): boolean {
    const pin = this.deps.sessionStore?.readPin()
    if (!pin) return false
    if (pin.issuer !== saved.issuer || pin.clientId !== saved.clientId) return false
    if (
      !jwksCacheFresh(pin.fetchedAt, this.now()) ||
      !jwksCacheFresh(saved.keysFetchedAt, this.now())
    )
      return false
    const actual = rsaKeyThumbprints(saved.keys)
    return (
      sameThumbprints(pin.thumbprints, saved.pinnedKeyThumbprints) &&
      sameThumbprints(pin.thumbprints, actual)
    )
  }

  private async verifyIdToken(
    token: string,
    keys: JSONWebKeySet,
    config: AccountConfig
  ): Promise<JWTPayload> {
    return (
      await jwtVerify(token, createLocalJWKSet(keys), {
        issuer: config.issuer,
        audience: config.clientId,
        algorithms: ['RS256'],
        requiredClaims: ['exp', 'iat', 'sub'],
        currentDate: new Date(this.now())
      })
    ).payload
  }

  private async fetchJwks(config: AccountConfig, signal: AbortSignal): Promise<JSONWebKeySet> {
    const keysResponse = await this.request(new URL('.well-known/jwks.json', config.issuer), {
      signal,
      redirect: 'error'
    })
    if (!keysResponse.ok) throw new Error('Signing keys unavailable.')
    return (await keysResponse.json()) as JSONWebKeySet
  }

  private async rememberKeys(
    keys: JSONWebKeySet,
    session: SavedAccountSession
  ): Promise<SavedAccountSession> {
    const thumbprints = rsaKeyThumbprints(keys)
    if (thumbprints.length === 0) throw new Error('Signing keys unavailable.')
    const fetchedAt = this.now()
    const pin: AccountJwksPin = {
      version: 1,
      issuer: session.issuer,
      clientId: session.clientId,
      thumbprints,
      fetchedAt
    }
    this.deps.sessionStore?.writePin(pin)
    return { ...session, keys, keysFetchedAt: fetchedAt, pinnedKeyThumbprints: thumbprints }
  }

  private async recover(): Promise<void> {
    const revision = this.revision
    const config = this.deps.config!
    const saved = this.deps.sessionStore!.read()
    if (!saved) return
    if (saved.issuer !== config.issuer || saved.clientId !== config.clientId) {
      this.deps.sessionStore!.clear()
      return
    }
    const active = (): boolean => !this.disposed && revision === this.revision && !this.attempt
    try {
      let session: SavedAccountSession = saved
      let payload: JWTPayload | undefined
      const trusted = this.cachedKeysTrusted(saved)
      let issuerRejected = false
      const signal = AbortSignal.timeout(15_000)
      if (trusted) {
        try {
          payload = await this.verifyIdToken(saved.idToken, saved.keys, config)
          if ((payload.exp ?? 0) * 1000 - this.now() < 60_000 && saved.refreshToken)
            payload = undefined
        } catch {
          payload = undefined
        }
      } else if (idTokenStillValid(saved.idToken, this.now())) {
        // Stale or unpinned keys are not a signature. Re-fetch the issuer JWKS
        // and pin whatever that response actually contains.
        const keys = await this.fetchJwks(config, signal)
        try {
          payload = await this.verifyIdToken(saved.idToken, keys, config)
          session = await this.rememberKeys(keys, saved)
        } catch {
          payload = undefined
          issuerRejected = true
        }
      }
      if (!payload) {
        if (!saved.refreshToken) {
          if (trusted || issuerRejected || !idTokenStillValid(saved.idToken, this.now()))
            this.deps.sessionStore!.clear()
          return
        }
        const response = await this.request(new URL('oauth/token', config.issuer), {
          method: 'POST',
          redirect: 'error',
          signal,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: config.clientId,
            refresh_token: saved.refreshToken
          })
        })
        if (!response.ok) {
          if (response.status === 400 || response.status === 401) {
            if (active()) {
              this.deps.sessionStore!.clear()
              this.user = undefined
              this.membershipClaim = undefined
              this.expiresAt = undefined
            }
          }
          throw new Error('Account refresh failed.')
        }
        const tokens = (await response.json()) as { id_token?: string; refresh_token?: string }
        if (
          typeof tokens.id_token !== 'string' ||
          (tokens.refresh_token !== undefined &&
            (typeof tokens.refresh_token !== 'string' || !tokens.refresh_token))
        )
          throw new Error('Invalid refresh response.')
        const keys = await this.fetchJwks(config, signal)
        payload = await this.verifyIdToken(tokens.id_token, keys, config)
        session = await this.rememberKeys(keys, {
          ...saved,
          idToken: tokens.id_token,
          refreshToken: tokens.refresh_token ?? saved.refreshToken
        })
      }
      if (
        payload.sub !== saved.subject ||
        (config.organization !== undefined && payload.org_id !== config.organization) ||
        (payload.nonce !== undefined && payload.nonce !== saved.nonce) ||
        (payload.azp !== undefined && payload.azp !== config.clientId) ||
        (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== config.clientId) ||
        payload.email_verified !== true ||
        typeof payload.email !== 'string'
      )
        throw new Error('Invalid restored identity.')
      if (!active()) return
      const bound = await this.deps.bindOwner({ issuer: config.issuer, subject: payload.sub! })
      if (!active()) return
      if (!bound) {
        this.deps.sessionStore!.clear()
        this.error = 'different-owner'
        return
      }
      this.deps.sessionStore!.write(session)
      this.expiresAt = payload.exp! * 1000
      this.membershipClaim = payload[MEMBERSHIP_CLAIM]
      this.user = {
        subject: payload.sub!,
        email: payload.email,
        name: typeof payload.name === 'string' ? payload.name : undefined
      }
      this.error = undefined
    } catch {
      if (active()) this.retryAfter = this.now() + 15_000
    }
  }

  private readonly deps: Dependencies

  constructor(deps: Dependencies) {
    // A beta build skips login. Drop the tenant, session, and consent files so it
    // cannot collect an account or open Auth0.
    this.deps = isDraPrerelease()
      ? {
          ...deps,
          config: undefined,
          configurationError: false,
          sessionStore: undefined,
          consent: undefined,
          consentError: false,
          terms: undefined,
          termsError: false,
          consentStore: undefined
        }
      : deps
    this.now = this.deps.now ?? Date.now
    this.request = this.deps.fetch ?? fetch
  }

  snapshot(): AccountState {
    if (this.expiresAt !== undefined && this.now() >= this.expiresAt) {
      this.user = undefined
      this.expiresAt = undefined
      this.membershipClaim = undefined
    }
    return {
      configured: Boolean(this.deps.config),
      profile: this.deps.profile,
      required: Boolean(this.deps.config || this.deps.configurationError),
      pending: Boolean(this.attempt),
      methods: this.deps.config
        ? [
            'email',
            ...(['google', 'microsoft', 'apple', 'institution'] as const).filter((method) =>
              Boolean(this.deps.config?.connections[method])
            )
          ]
        : [],
      user: this.user ? { ...this.user } : undefined,
      expiresAt: this.expiresAt,
      membership: this.user
        ? membershipFromVerifiedClaim(this.membershipClaim, this.now())
        : undefined,
      error: this.deps.configurationError
        ? 'configuration'
        : this.deps.consentError
          ? 'consent'
          : this.deps.termsError
            ? 'terms'
            : this.error,
      consent: this.noticeState('consent'),
      terms: this.noticeState('terms')
    }
  }

  private noticesActive(): boolean {
    return Boolean(
      this.deps.consent ||
      this.deps.consentError ||
      this.deps.terms ||
      this.deps.termsError ||
      this.deps.consentStore
    )
  }

  private noticeState(kind: 'consent' | 'terms'): AccountState['consent'] {
    if (!this.deps.config || !this.noticesActive()) return undefined
    const notice = kind === 'consent' ? this.deps.consent : this.deps.terms
    const failed = kind === 'consent' ? this.deps.consentError : this.deps.termsError
    if (failed || !notice) return { required: true }
    const stored = this.deps.consentStore?.read()
    const saved = kind === 'consent' ? stored?.consent : stored?.terms
    const current = saved?.version === notice.version ? saved : undefined
    return {
      required: !current,
      notice,
      acceptedAt: current?.acceptedAt
    }
  }

  private acceptanceForLogin(request: AccountLoginRequest):
    | {
        consent: { version: string; acceptedAt: string }
        terms: { version: string; acceptedAt: string }
      }
    | undefined {
    if (!this.noticesActive()) return undefined
    if (this.deps.consentError || !this.deps.consent || !this.deps.consentStore)
      throw new Error('Account consent is unavailable.')
    if (this.deps.termsError || !this.deps.terms) throw new Error('Account terms are unavailable.')
    const stored = this.deps.consentStore.read()
    const consentCurrent =
      stored?.consent?.version === this.deps.consent.version ? stored.consent : undefined
    const termsCurrent =
      stored?.terms?.version === this.deps.terms.version ? stored.terms : undefined
    if (!consentCurrent && request.consentAccepted !== true)
      throw new Error('Account consent is required.')
    if (!termsCurrent && request.termsAccepted !== true)
      throw new Error('Account terms are required.')
    const acceptedAt = new Date(this.now()).toISOString()
    const consent = consentCurrent ?? { version: this.deps.consent.version, acceptedAt }
    const terms = termsCurrent ?? { version: this.deps.terms.version, acceptedAt }
    if (!consentCurrent || !termsCurrent) this.deps.consentStore.write({ consent, terms })
    return { consent, terms }
  }

  assertAccess(): void {
    const state = this.snapshot()
    if (state.required && (!state.user || state.consent?.required || state.terms?.required))
      throw new Error('DRA account login required.')
  }

  assertFeature(feature: MembershipFeature): void {
    this.assertAccess()
    // TODO(membership): a signed ID-token claim is not a server-side membership
    // check. Real enforcement still needs an issuer or API check after beta.
    // Preserve existing offline/local-only deployments. Authenticated distributions enforce plans.
    if (!this.deps.config && !this.deps.configurationError) return
    if (!membershipAllows(this.snapshot().membership ?? { plan: 'free', status: 'free' }, feature))
      throw new Error(`DRA_MEMBERSHIP_REQUIRED:${MEMBERSHIP_MINIMUM[feature]}:${feature}`)
  }

  async checkNotebookAccess(): Promise<NotebookAccessCheck> {
    await this.getState()
    const check = (feature: MembershipFeature): { allowed: boolean; error?: string } => {
      try {
        this.assertFeature(feature)
        return { allowed: true }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (
          !message.startsWith('DRA_MEMBERSHIP_REQUIRED:') &&
          message !== 'DRA account login required.'
        )
          throw error
        return { allowed: false, error: message }
      }
    }
    return {
      checkedAt: this.now(),
      state: this.snapshot(),
      foreground: check('notebook-execution'),
      background: check('background-execution')
    }
  }

  private stopAttempt(): void {
    const attempt = this.attempt
    this.attempt = undefined
    if (!attempt) return
    clearTimeout(attempt.timer)
    attempt.abort.abort()
    attempt.server?.close()
    attempt.server?.closeAllConnections()
  }

  logout(): AccountState {
    this.revision++
    this.retryAfter = 0
    this.stopAttempt()
    this.user = undefined
    this.expiresAt = undefined
    this.membershipClaim = undefined
    this.error = undefined
    this.deps.sessionStore?.clear()
    return this.snapshot()
  }

  dispose(): void {
    this.disposed = true
    this.revision++
    this.stopAttempt()
    this.user = undefined
    this.membershipClaim = undefined
  }

  async begin(request: AccountLoginRequest): Promise<AccountState> {
    const config = this.deps.config
    if (
      !config ||
      !request ||
      !this.snapshot().methods.includes(request.method) ||
      (request.signup !== undefined && typeof request.signup !== 'boolean') ||
      (request.consentAccepted !== undefined && typeof request.consentAccepted !== 'boolean') ||
      (request.termsAccepted !== undefined && typeof request.termsAccepted !== 'boolean')
    ) {
      throw new Error('Account login method is unavailable.')
    }
    if (this.attempt) return this.snapshot()
    const acceptance = this.acceptanceForLogin(request)
    this.revision++
    this.error = undefined
    const attempt: Attempt = {
      state: randomBytes(32).toString('base64url'),
      nonce: randomBytes(32).toString('base64url'),
      verifier: randomBytes(32).toString('base64url'),
      consuming: false,
      abort: new AbortController()
    }
    this.attempt = attempt
    const redirect = `http://127.0.0.1:${config.port}/account/callback`
    const server = createServer((incoming, response) => {
      response.setHeader('Cache-Control', 'no-store')
      response.setHeader('Content-Type', 'text/plain; charset=utf-8')
      response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
      response.setHeader('Referrer-Policy', 'no-referrer')
      const url = new URL(incoming.url ?? '/', redirect)
      if (
        incoming.method !== 'GET' ||
        incoming.headers.host !== `127.0.0.1:${config.port}` ||
        url.pathname !== '/account/callback' ||
        this.attempt !== attempt ||
        attempt.consuming ||
        !sameSecret(url.searchParams.get('state') ?? '', attempt.state)
      ) {
        response.writeHead(400).end('Invalid login callback.')
        return
      }
      const code = url.searchParams.get('code')
      if (!code || url.searchParams.has('error')) {
        response.writeHead(400).end('Login was not completed. Return to DRA and retry.')
        this.error = 'login'
        this.stopAttempt()
        return
      }
      attempt.consuming = true
      void this.finish(attempt, code, redirect).then((ok) => {
        response
          .writeHead(ok ? 200 : 400)
          .end(
            ok
              ? 'DRA login complete. You can close this tab and return to DRA. / 登录完成，请返回 DRA。'
              : 'DRA login failed. Return to DRA for details. / 登录失败，请返回 DRA。'
          )
        if (this.attempt === attempt) {
          // Let the final response flush before closing keep-alive sockets.
          this.attempt = undefined
          clearTimeout(attempt.timer)
          server.close()
          server.closeIdleConnections()
        }
      })
    })
    attempt.server = server
    server.requestTimeout = 15_000
    server.headersTimeout = 10_000
    attempt.timer = setTimeout(() => {
      if (this.attempt !== attempt) return
      this.error = 'timeout'
      this.stopAttempt()
    }, this.deps.timeoutMs ?? 300_000)
    attempt.timer.unref()
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(config.port, '127.0.0.1', resolve)
      })
      if (this.attempt !== attempt) {
        server.close()
        return this.snapshot()
      }
      const url = new URL('authorize', config.issuer)
      url.search = new URLSearchParams({
        response_type: 'code',
        client_id: config.clientId,
        redirect_uri: redirect,
        scope: 'openid profile email offline_access',
        state: attempt.state,
        nonce: attempt.nonce,
        code_challenge: createHash('sha256').update(attempt.verifier).digest('base64url'),
        code_challenge_method: 'S256'
      }).toString()
      if (request.signup) url.searchParams.set('screen_hint', 'signup')
      // Ask for credentials on shared PCs instead of silently reusing browser SSO.
      url.searchParams.set('prompt', 'login')
      url.searchParams.set('max_age', '0')
      if (config.audience) url.searchParams.set('audience', config.audience)
      if (config.organization) url.searchParams.set('organization', config.organization)
      if (request.method !== 'email') {
        url.searchParams.set('connection', config.connections[request.method]!)
      }
      if (acceptance) {
        url.searchParams.set('ext-consent_version', acceptance.consent.version)
        url.searchParams.set('ext-consent_accepted_at', acceptance.consent.acceptedAt)
        url.searchParams.set('ext-terms_version', acceptance.terms.version)
        url.searchParams.set('ext-terms_accepted_at', acceptance.terms.acceptedAt)
      }
      await this.deps.openBrowser(url.href)
    } catch {
      if (this.attempt === attempt) {
        this.error = 'login'
        this.stopAttempt()
      }
    }
    return this.snapshot()
  }

  private async finish(attempt: Attempt, code: string, redirect: string): Promise<boolean> {
    const config = this.deps.config!
    const signal = AbortSignal.any([attempt.abort.signal, AbortSignal.timeout(15_000)])
    try {
      const tokenResponse = await this.request(new URL('oauth/token', config.issuer), {
        method: 'POST',
        redirect: 'error',
        signal,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: config.clientId,
          code,
          code_verifier: attempt.verifier,
          redirect_uri: redirect
        })
      })
      if (!tokenResponse.ok) throw new Error('Token exchange failed.')
      const tokens: unknown = await tokenResponse.json()
      if (
        !tokens ||
        typeof tokens !== 'object' ||
        !('id_token' in tokens) ||
        typeof tokens.id_token !== 'string'
      )
        throw new Error('Missing ID token.')
      const keysResponse = await this.request(new URL('.well-known/jwks.json', config.issuer), {
        signal,
        redirect: 'error'
      })
      if (!keysResponse.ok) throw new Error('Signing keys unavailable.')
      const keys = (await keysResponse.json()) as JSONWebKeySet
      const { payload } = await jwtVerify(tokens.id_token, createLocalJWKSet(keys), {
        issuer: config.issuer,
        audience: config.clientId,
        algorithms: ['RS256'],
        requiredClaims: ['exp', 'iat', 'sub', 'nonce'],
        currentDate: new Date(this.now())
      })
      if (
        !payload.sub ||
        payload.nonce !== attempt.nonce ||
        (payload.azp !== undefined && payload.azp !== config.clientId) ||
        (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== config.clientId)
      ) {
        throw new Error('Invalid identity claims.')
      }
      if (config.organization && payload.org_id !== config.organization)
        throw new Error('Unexpected account organization.')
      if (payload.email_verified !== true || typeof payload.email !== 'string') {
        if (this.attempt === attempt) this.error = 'email-unverified'
        return false
      }
      if (this.attempt !== attempt) return false
      const bound = await this.deps.bindOwner({ issuer: config.issuer, subject: payload.sub })
      if (this.attempt !== attempt) return false
      if (!bound) {
        this.error = 'different-owner'
        return false
      }
      this.expiresAt = Math.min(payload.exp! * 1000, this.now() + 8 * 60 * 60 * 1000)
      if (this.expiresAt <= this.now()) throw new Error('Expired session.')
      this.membershipClaim = payload[MEMBERSHIP_CLAIM]
      this.user = {
        subject: payload.sub,
        email: payload.email,
        name: typeof payload.name === 'string' ? payload.name : undefined
      }
      const refreshToken =
        'refresh_token' in tokens &&
        typeof tokens.refresh_token === 'string' &&
        tokens.refresh_token
          ? tokens.refresh_token
          : undefined
      const stored = await this.rememberKeys(keys, {
        version: 1,
        issuer: config.issuer,
        clientId: config.clientId,
        subject: payload.sub,
        idToken: tokens.id_token,
        nonce: attempt.nonce,
        keys,
        keysFetchedAt: this.now(),
        pinnedKeyThumbprints: rsaKeyThumbprints(keys),
        refreshToken
      })
      this.deps.sessionStore?.write(stored)
      this.error = undefined
      return true
    } catch {
      if (this.attempt === attempt) {
        this.user = undefined
        this.expiresAt = undefined
        this.membershipClaim = undefined
        this.error = 'login'
      }
      return false
    }
  }
}
