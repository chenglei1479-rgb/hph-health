import { createServer } from 'node:http'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import type { AccountConsentNotice } from '../../shared/account'
import {
  createAccountConsentStore,
  parseAccountConsentNotice,
  readAccountConsent,
  type AccountConsentStore
} from './consent'
import { AccountOwner } from './owner'

const owners: AccountOwner[] = []
const dirs: string[] = []
afterEach(() => {
  for (const owner of owners.splice(0)) owner.dispose()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const temp = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'dra-consent-'))
  dirs.push(dir)
  return dir
}

const notice = (version = '2026-10-14.placeholder'): AccountConsentNotice => ({
  version,
  title: '国外移転（仮文）',
  body: '運営者はシンガポール法人です。処理者は米国の Okta です。米国には包括的な連邦プライバシー法がありません。講じる措置として契約で範囲を限定します。',
  acknowledgement: '同意します（仮文）'
})

const listenPort = async (): Promise<number> => {
  const listener = createServer()
  await new Promise<void>((resolve) => listener.listen(0, '127.0.0.1', resolve))
  const address = listener.address()
  if (!address || typeof address === 'string') throw new Error('No callback port.')
  await new Promise<void>((resolve) => listener.close(() => resolve()))
  return address.port
}

const gated = async (options: {
  notice?: AccountConsentNotice
  consentError?: boolean
  store?: AccountConsentStore
  now?: () => number
  configurationError?: boolean
}): Promise<{
  owner: AccountOwner
  openBrowser: ReturnType<typeof vi.fn>
  authorization: () => URL | undefined
}> => {
  const port = await listenPort()
  let authorization: URL | undefined
  const openBrowser = vi.fn(async (url: string) => {
    authorization = new URL(url)
  })
  const owner = new AccountOwner({
    config: options.configurationError
      ? undefined
      : {
          issuer: 'https://tenant.auth0.com/',
          clientId: 'client-1',
          port,
          connections: {
            google: 'google-oauth2',
            microsoft: 'windowslive',
            apple: 'apple',
            institution: 'hospital-saml'
          }
        },
    configurationError: options.configurationError,
    consent: options.notice,
    consentError: options.consentError,
    consentStore: options.store,
    openBrowser,
    bindOwner: async () => true,
    now: options.now,
    fetch: (async () => {
      throw new Error('network unused')
    }) as typeof fetch
  })
  owners.push(owner)
  return { owner, openBrowser, authorization: () => authorization }
}

it('ships the versioned lawyer draft, including its fill-in placeholders', () => {
  const shipped = readAccountConsent(['resources/account-consent.json'])
  expect(shipped.version).toBe('2026-10-14.draft1')
  expect(shipped.title).toBe('【外国にある第三者への個人データの提供に関する同意】')
  expect(shipped.body).toContain('【運営会社名】')
  expect(shipped.body).toContain('シンガポール共和国【住所】')
  expect(shipped.body).toContain('代表者：【氏名】')
  expect(shipped.body).toContain('Okta, Inc.（所在国：アメリカ合衆国）')
  expect(shipped.body).toContain(
    'アメリカ合衆国には、日本の個人情報保護法に相当する包括的な連邦法はなく'
  )
  expect(shipped.body).toContain('【ISO/IEC 27001 認証等、同社が講じている措置】')
  expect(shipped.body).toContain('診療・研究データ（患者情報を含む）は Okta, Inc. に提供されません')
  expect(shipped.acknowledgement).toBe('上記の内容を確認し、同意します。')
})

it('rejects an unsafe or empty consent version', () => {
  const fields = { title: '題名', body: '本文', acknowledgement: '同意します' }
  expect(() => parseAccountConsentNotice({ ...fields, version: '../escape' })).toThrow(/version/)
  expect(() => parseAccountConsentNotice({ ...fields, version: '' })).toThrow(/version/)
  expect(() => parseAccountConsentNotice({ ...fields, version: 'ok', body: '   ' })).toThrow(
    /invalid/
  )
  expect(() => readAccountConsent([join(temp(), 'missing.json')])).toThrow(/missing/)
})

it('deletes a corrupt local consent record', () => {
  const dir = temp()
  const file = join(dir, 'account-consent-record.json')
  writeFileSync(file, '{')
  expect(createAccountConsentStore(dir).read()).toBeUndefined()
  expect(existsSync(file)).toBe(false)
})

it('blocks sign-in until consent is accepted, then reuses and refreshes the record', async () => {
  const store = createAccountConsentStore(temp())
  let now = Date.parse('2026-10-14T01:02:03.000Z')
  const current = notice()
  const first = await gated({ notice: current, store, now: () => now })
  expect(first.owner.snapshot().consent).toMatchObject({ required: true, notice: current })
  expect(() => first.owner.assertAccess()).toThrow('DRA account login required.')
  await expect(first.owner.begin({ method: 'email' })).rejects.toThrow(
    'Account consent is required.'
  )
  await expect(first.owner.begin({ method: 'email', consentAccepted: false })).rejects.toThrow(
    'Account consent is required.'
  )
  expect(first.openBrowser).not.toHaveBeenCalled()
  expect(store.read()).toBeUndefined()

  await first.owner.begin({ method: 'email', signup: true, consentAccepted: true })
  expect(store.read()).toEqual({
    version: '2026-10-14.placeholder',
    acceptedAt: '2026-10-14T01:02:03.000Z'
  })
  const accepted = first.authorization()
  expect(accepted?.searchParams.get('screen_hint')).toBe('signup')
  expect(accepted?.searchParams.get('ext-consent_version')).toBe('2026-10-14.placeholder')
  expect(accepted?.searchParams.get('ext-consent_accepted_at')).toBe('2026-10-14T01:02:03.000Z')
  expect(accepted?.href).not.toContain('シンガポール')
  expect(accepted?.href).not.toContain('講じる措置')
  expect(first.owner.snapshot().consent).toMatchObject({
    required: false,
    acceptedAt: '2026-10-14T01:02:03.000Z'
  })
  first.owner.dispose()

  now = Date.parse('2026-10-15T00:00:00.000Z')
  const repeat = await gated({ notice: current, store, now: () => now })
  await repeat.owner.begin({ method: 'email' })
  expect(repeat.authorization()?.searchParams.get('ext-consent_version')).toBe(
    '2026-10-14.placeholder'
  )
  expect(repeat.authorization()?.searchParams.get('ext-consent_accepted_at')).toBe(
    '2026-10-14T01:02:03.000Z'
  )
  expect(store.read()?.acceptedAt).toBe('2026-10-14T01:02:03.000Z')
  repeat.owner.dispose()

  current.version = '2026-11-01.legal'
  now = Date.parse('2026-11-01T04:05:06.000Z')
  const renewed = await gated({ notice: current, store, now: () => now })
  expect(renewed.owner.snapshot().consent?.required).toBe(true)
  await expect(renewed.owner.begin({ method: 'email' })).rejects.toThrow(
    'Account consent is required.'
  )
  await renewed.owner.begin({ method: 'google', consentAccepted: true })
  expect(store.read()).toEqual({
    version: '2026-11-01.legal',
    acceptedAt: '2026-11-01T04:05:06.000Z'
  })
  expect(renewed.authorization()?.searchParams.get('ext-consent_version')).toBe('2026-11-01.legal')
  expect(renewed.authorization()?.searchParams.get('ext-consent_accepted_at')).toBe(
    '2026-11-01T04:05:06.000Z'
  )
  expect(renewed.authorization()?.searchParams.get('connection')).toBe('google-oauth2')
})

it('fails closed when the notice cannot be loaded and keeps configuration errors first', async () => {
  const broken = await gated({ consentError: true, store: createAccountConsentStore(temp()) })
  expect(broken.owner.snapshot()).toMatchObject({
    error: 'consent',
    consent: { required: true }
  })
  await expect(broken.owner.begin({ method: 'email', consentAccepted: true })).rejects.toThrow(
    'Account consent is unavailable.'
  )
  expect(broken.openBrowser).not.toHaveBeenCalled()

  const configured = await gated({ configurationError: true, consentError: true })
  expect(configured.owner.snapshot().error).toBe('configuration')
})
