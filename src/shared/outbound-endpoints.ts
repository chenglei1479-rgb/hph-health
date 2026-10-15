import { CONNECTOR_CONTACT_EMAIL } from './connector-compliance'

export type OutboundEndpoint = {
  readonly id: string
  readonly host: string
  readonly sent: readonly string[]
  readonly recipient: string
  readonly country: string
  readonly purpose: string
}

// Unified catalog for the Japan research and PDC connectors. Notebook egress and the
// connector engine both treat this list as the allowlist for these hosts.
export const OUTBOUND_ENDPOINTS: readonly OutboundEndpoint[] = [
  {
    id: 'cinii',
    host: 'cir.nii.ac.jp',
    sent: ['IP address', 'query terms', 'optional NII appid'],
    recipient: 'National Institute of Informatics (NII), CiNii Research',
    country: 'Japan',
    purpose:
      'Search public CiNii article, project, and dataset metadata when an optional NII appid is saved.'
  },
  {
    id: 'jstage',
    host: 'api.jstage.jst.go.jp',
    sent: ['IP address', 'query terms'],
    recipient: 'Japan Science and Technology Agency (JST), J-STAGE',
    country: 'Japan',
    purpose: 'Search public J-STAGE article metadata through the official JST API.'
  },
  {
    id: 'pheweb',
    host: 'pheweb.jp',
    sent: ['IP address', 'query terms'],
    recipient: 'BioBank Japan PheWeb',
    country: 'Japan',
    purpose:
      'Query public BioBank Japan GWAS summary statistics through the official API and the public download catalogue. Individual-level data is not requested.'
  },
  {
    id: 'humandbs',
    host: 'humandbs.dbcls.jp',
    sent: ['IP address', 'query terms'],
    recipient: 'NBDC Human Database, Database Center for Life Science (DBCLS)',
    country: 'Japan',
    purpose:
      'Read the public NBDC hum0014 catalogue and allow only datasets marked 制限なし / unrestricted.'
  },
  {
    id: 'jenger',
    host: 'jenger.riken.jp',
    sent: ['IP address', 'query terms'],
    recipient: 'RIKEN, JENGER',
    country: 'Japan',
    purpose: 'Read the public JENGER result catalogue and official download links.'
  },
  {
    id: 'pdc',
    host: 'pdc.cancer.gov',
    sent: ['IP address', 'query terms'],
    recipient: 'National Cancer Institute Proteomic Data Commons',
    country: 'United States',
    purpose:
      'Discover public PDC study, biospecimen, and file metadata. Study files are not downloaded by these tools.'
  }
]

const REQUIRED_HOSTS = [
  'cir.nii.ac.jp',
  'api.jstage.jst.go.jp',
  'pheweb.jp',
  'humandbs.dbcls.jp',
  'jenger.riken.jp',
  'pdc.cancer.gov'
] as const

export function outboundEndpointFor(host: string): OutboundEndpoint | undefined {
  return OUTBOUND_ENDPOINTS.find((endpoint) => endpoint.host === host)
}

export function assertOutboundEndpointRegistered(host: string): void {
  if (!REQUIRED_HOSTS.includes(host as (typeof REQUIRED_HOSTS)[number])) return
  if (!outboundEndpointFor(host)) {
    throw new Error(
      `Outbound host ${host} is not in the endpoint catalog. The request was not sent.`
    )
  }
}

export function renderOutboundEndpointsMarkdown(): string {
  const rows = OUTBOUND_ENDPOINTS.map(
    (endpoint) =>
      `| \`${endpoint.host}\` | ${endpoint.sent.join('; ')} | ${endpoint.recipient} | ${endpoint.country} | ${endpoint.purpose} |`
  )
  return [
    '# External endpoints',
    '',
    'Catalog of outbound connector hosts this application may contact. These hosts are registered in the unified outbound endpoint allowlist. Scraped catalogues also send the User-Agent `DRA/<version> (+' +
      CONNECTOR_CONTACT_EMAIL +
      ')`. The contact address is the company address ' +
      CONNECTOR_CONTACT_EMAIL +
      '.',
    '',
    'JENGER (`jenger.riken.jp`) was checked on 2026-10-15: TCP port 443 accepted a connection but the TLS handshake timed out, and TCP port 80 accepted a connection but returned no bytes. The catalogue request stays on `http://jenger.riken.jp/en/result` until HTTPS serves a response.',
    '',
    '| Host | What is sent | Recipient | Country | Purpose |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
    ''
  ].join('\n')
}
