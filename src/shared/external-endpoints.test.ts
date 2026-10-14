import { describe, expect, it } from 'vitest'

import {
  decideOutboundUrl,
  externalEndpointEntries,
  userConfiguredModelEntry
} from './external-endpoints'

describe('outbound endpoint decisions', () => {
  it('allows catalog hosts and user-configured model hosts, and blocks anything else', () => {
    expect(decideOutboundUrl('https://dra-prod.jp.auth0.com/authorize').allowed).toBe(true)
    expect(
      decideOutboundUrl('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi')
    ).toMatchObject({
      id: 'pubmed-eutils'
    })
    expect(decideOutboundUrl('https://stats.REPLACE_ME/dra/usage')).toMatchObject({
      id: 'telemetry'
    })
    expect(decideOutboundUrl('http://127.0.0.1:1234/v1/chat')).toMatchObject({ id: 'loopback' })
    const blocked = decideOutboundUrl('https://evil.example.net/collect')
    expect(blocked).toEqual({ allowed: false, host: 'evil.example.net' })
    const modelHosts = new Set(['api.openai.com'])
    expect(
      decideOutboundUrl('https://api.openai.com/v1/chat/completions', modelHosts)
    ).toMatchObject({
      id: 'model-endpoints'
    })
    expect(
      externalEndpointEntries().some((entry) => entry.defaultEnabled && entry.id === 'telemetry')
    ).toBe(false)
    const disclosed = userConfiguredModelEntry()
    expect(disclosed.disclosureNameJa).toBe('利用者が設定した AI サービス')
    expect(disclosed.dataSentJa).toContain('表の構造')
    expect(disclosed.dataSentJa).toContain('合成サンプル')
    expect(disclosed.dataSentJa).toContain('マスキングチェック')
    expect(disclosed.dataSentJa).toContain('仮名化済み本文')
    expect(disclosed.recipientJa).toContain('利用者が選んだ提供者')
    expect(disclosed.purposeJa).toContain('利用者が選んだ提供者の規約')
  })
})
