import { describe, expect, it } from 'vitest'
import { configuredDataRoutes, safeEndpoint } from './research-data-flow'
import type { ProviderView } from './settings'
const provider = (id: string, baseUrl?: string): ProviderView => ({
  id,
  type: 'custom',
  name: id,
  baseUrl,
  hasKey: true,
  needsKey: true,
  supportsImageInput: false,
  models: ['m'],
  maskedKey: 'secret-marker',
  accountEmail: 'private@example.test'
})
it('shows only origins and never URL credentials, paths, query tokens or account hints', () => {
  const result = configuredDataRoutes({
    providers: [
      provider('a', 'https://user:password@api.example.test:8443/private/path?key=secret#fragment')
    ],
    providerId: 'a',
    model: 'm',
    details: { mode: 'inherit', reasoningEffort: 'low' },
    subagent: { mode: 'inherit' },
    reviewer: { mode: 'inherit' }
  })
  expect(result[0].endpoint).toBe('https://api.example.test:8443')
  for (const secret of ['password', 'private', 'secret-marker', 'fragment', '?key', 'user:'])
    expect(JSON.stringify(result)).not.toContain(secret)
})
describe('configured endpoint boundaries', () => {
  it.each(['http://localhost:8080', 'http://127.0.0.2', 'http://[::1]:11434'])(
    'labels actual loopback %s without promising offline processing',
    (url) => {
      expect(safeEndpoint(url)?.loopback).toBe(true)
    }
  )
  it.each(['https://localhost.evil.test', 'http://127.evil.test', 'https://10.0.0.8'])(
    'does not call a network hostname loopback: %s',
    (url) => {
      expect(safeEndpoint(url)?.loopback).toBe(false)
    }
  )
  it.each(['not a URL', 'file:///secret', 'javascript:secret'])(
    'keeps unsupported endpoints unknown: %s',
    (url) => {
      expect(safeEndpoint(url)).toBeUndefined()
    }
  )
})
it('keeps fixed auxiliary recipients distinct, respects disabled routes and does not invent missing providers', () => {
  const routes = configuredDataRoutes({
    providers: [provider('a'), provider('b', 'https://b.test')],
    providerId: 'a',
    model: 'main',
    details: { mode: 'fixed', providerId: 'b', model: 'title', reasoningEffort: 'low' },
    subagent: { mode: 'inherit' },
    reviewer: { mode: 'fixed', providerId: 'missing', model: 'review', reasoningEffort: 'low' }
  })
  expect(routes.map((r) => [r.role, r.status, r.recipient])).toEqual([
    ['main', 'configured', 'a'],
    ['details', 'configured', 'b'],
    ['subagent', 'configured', 'a'],
    ['reviewer', 'unknown', undefined],
    ['vision', 'disabled', undefined]
  ])
  expect(routes[0].endpoint).toBeUndefined()
  const disabled = configuredDataRoutes({
    providers: [],
    details: { mode: 'disabled' },
    subagent: { mode: 'inherit' },
    reviewer: { mode: 'inherit' }
  })
  expect(disabled[0].status).toBe('unknown')
  expect(disabled[1].status).toBe('disabled')
})
