import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { OPEN_SCIENCE_DOMAIN_GROUPS } from './notebook-network'
import { OUTBOUND_ENDPOINTS, renderOutboundEndpointsMarkdown } from './outbound-endpoints'

describe('outbound endpoint catalog', () => {
  it('registers every connector host with what is sent, recipient, country, and purpose', () => {
    expect(OUTBOUND_ENDPOINTS.map((endpoint) => endpoint.host)).toEqual([
      'cir.nii.ac.jp',
      'api.jstage.jst.go.jp',
      'pheweb.jp',
      'humandbs.dbcls.jp',
      'jenger.riken.jp',
      'pdc.cancer.gov'
    ])
    for (const endpoint of OUTBOUND_ENDPOINTS) {
      expect(endpoint.sent).toEqual(expect.arrayContaining(['IP address', 'query terms']))
      expect(endpoint.recipient.trim()).not.toBe('')
      expect(endpoint.country.trim()).not.toBe('')
      expect(endpoint.purpose.trim()).not.toBe('')
    }
  })

  it('exports the same catalog the lawyer document contains', () => {
    const document = readFileSync(join(__dirname, '../../docs/external-endpoints.md'), 'utf8')
    expect(document).toBe(renderOutboundEndpointsMarkdown())
  })

  it('adds the connector hosts to the notebook egress allowlist', () => {
    const domains = OPEN_SCIENCE_DOMAIN_GROUPS.flatMap((group) => group.domains)
    expect(domains).toEqual(
      expect.arrayContaining([
        'cir.nii.ac.jp',
        'api.jstage.jst.go.jp',
        'pheweb.jp',
        'humandbs.dbcls.jp',
        'jenger.riken.jp',
        'pdc.cancer.gov'
      ])
    )
  })
})
