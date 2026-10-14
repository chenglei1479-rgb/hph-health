import { createHash } from 'node:crypto'
import type { JSONWebKeySet } from 'jose'

// Cached signing keys in account-session.enc are not an issuer. Trust them only
// inside this window, and only when their RFC 7638 thumbprints match the pin
// written after a live JWKS fetch.
export const JWKS_CACHE_TTL_MS = 60 * 60 * 1000

export type RsaJwk = { kty?: unknown; n?: unknown; e?: unknown }

export const rsaKeyThumbprint = (n: string, e: string): string =>
  createHash('sha256')
    .update(JSON.stringify({ e, kty: 'RSA', n }))
    .digest('base64url')

export const rsaKeyThumbprints = (set: JSONWebKeySet): string[] => {
  const prints: string[] = []
  for (const key of set.keys ?? []) {
    const rsa = key as RsaJwk
    if (rsa.kty !== 'RSA' || typeof rsa.n !== 'string' || typeof rsa.e !== 'string') continue
    if (!rsa.n || !rsa.e) continue
    prints.push(rsaKeyThumbprint(rsa.n, rsa.e))
  }
  return [...new Set(prints)].sort()
}

export const sameThumbprints = (left: readonly string[], right: readonly string[]): boolean => {
  if (left.length === 0 || left.length !== right.length) return false
  const a = [...left].sort()
  const b = [...right].sort()
  return a.every((value, index) => value === b[index])
}

export const jwksCacheFresh = (fetchedAt: number, now: number, ttl = JWKS_CACHE_TTL_MS): boolean =>
  Number.isFinite(fetchedAt) && fetchedAt <= now && now - fetchedAt <= ttl

export const idTokenStillValid = (token: string, now: number): boolean => {
  const payload = token.split('.')[1]
  if (!payload) return false
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      exp?: unknown
    }
    return typeof claims.exp === 'number' && claims.exp * 1000 - now >= 60_000
  } catch {
    return false
  }
}
