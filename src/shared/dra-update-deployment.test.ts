import { expect, it } from 'vitest'
import { parseDraUpdateDeployment } from './dra-update-deployment'
const configured = {
  enabled: true,
  provider: 'generic',
  url: 'https://updates.dra.example/stable/',
  manifestUrl: 'https://updates.dra.example/stable/version.json',
  publisherName: 'DRA Publisher',
  channel: 'latest'
}
it('disables updates explicitly and accepts a configured HTTPS feed with a signer', () => {
  expect(parseDraUpdateDeployment({ enabled: false })).toEqual({ enabled: false })
  expect(parseDraUpdateDeployment(configured)).toMatchObject({ publisherName: 'DRA Publisher' })
})
it('rejects legacy, insecure, unsigned or cross-origin update configuration', () => {
  for (const changes of [
    { url: 'https://statics.aipoch.com/stable/' },
    { url: 'http://updates.dra.example/' },
    { publisherName: '' },
    { manifestUrl: 'https://other.example/version.json' },
    { clientSecret: 'forbidden' },
    { url: 'https://user:secret@updates.dra.example/' }
  ]) {
    expect(() => parseDraUpdateDeployment({ ...configured, ...changes })).toThrow()
  }
})
