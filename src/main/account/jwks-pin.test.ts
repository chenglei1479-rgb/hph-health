import { exportJWK, generateKeyPair } from 'jose'
import { expect, it } from 'vitest'
import {
  JWKS_CACHE_TTL_MS,
  idTokenStillValid,
  jwksCacheFresh,
  rsaKeyThumbprint,
  rsaKeyThumbprints,
  sameThumbprints
} from './jwks-pin'

it('pins an RSA key by its RFC 7638 thumbprint and ignores a swapped key', async () => {
  const keys = await generateKeyPair('RS256', { extractable: true })
  const other = await generateKeyPair('RS256', { extractable: true })
  const jwk = await exportJWK(keys.publicKey)
  const swapped = await exportJWK(other.publicKey)
  const pin = rsaKeyThumbprints({ keys: [jwk] })
  expect(pin).toEqual([rsaKeyThumbprint(jwk.n!, jwk.e!)])
  expect(sameThumbprints(pin, rsaKeyThumbprints({ keys: [jwk] }))).toBe(true)
  expect(sameThumbprints(pin, rsaKeyThumbprints({ keys: [swapped] }))).toBe(false)
  expect(sameThumbprints([], pin)).toBe(false)
})

it('treats a future or expired JWKS cache as untrusted', () => {
  const now = 1_000_000
  expect(jwksCacheFresh(now, now)).toBe(true)
  expect(jwksCacheFresh(now - JWKS_CACHE_TTL_MS, now)).toBe(true)
  expect(jwksCacheFresh(now - JWKS_CACHE_TTL_MS - 1, now)).toBe(false)
  expect(jwksCacheFresh(now + 1, now)).toBe(false)
})

it('reads token expiry without trusting the signature', () => {
  const exp = Math.floor(Date.now() / 1000) + 3600
  const payload = Buffer.from(JSON.stringify({ exp })).toString('base64url')
  expect(idTokenStillValid(`x.${payload}.sig`, Date.now())).toBe(true)
  expect(idTokenStillValid('not-a-jwt', Date.now())).toBe(false)
})
