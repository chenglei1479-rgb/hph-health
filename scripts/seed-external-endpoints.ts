import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { collectOutboundHosts, isModelCatalogHost } from './external-endpoint-hosts.ts'

type Entry = {
  id: string
  kind: 'static' | 'user-configured-model'
  host: string | null
  requirement: 'required' | 'optional'
  defaultEnabled: boolean
  dataSentJa: string
  recipientJa: string
  companyJa: string
  countryJa: string
  purposeJa: string
  disclosureNameJa?: string
  exampleHosts?: string[]
}

const recipient = (company: string, country: string): string => `${company}（${country}）`

const specials: Entry[] = [
  {
    id: 'update-server',
    kind: 'static',
    host: 'updates.REPLACE_ME',
    requirement: 'optional',
    defaultEnabled: false,
    dataSentJa:
      'アプリのバージョン、更新チャネル、端末の更新コホート識別子。文書、プロンプト、ファイル名は送りません。',
    companyJa: '未定（プレースホルダー）',
    countryJa: '未定',
    recipientJa: recipient('未定（プレースホルダー）', '未定'),
    purposeJa: '署名済み更新の確認と取得'
  },
  {
    id: 'auth0',
    kind: 'static',
    host: 'dra-prod.jp.auth0.com',
    requirement: 'required',
    defaultEnabled: true,
    dataSentJa:
      'アカウント認証に使う識別子（メールアドレス、認証コード、トークン）。診療データや研究ファイルは送りません。',
    companyJa: 'Okta, Inc.（Auth0）',
    countryJa: 'アメリカ合衆国（テナントは日本リージョン）',
    recipientJa: recipient('Okta, Inc.（Auth0）', 'アメリカ合衆国（テナントは日本リージョン）'),
    purposeJa: 'アカウント認証'
  },
  {
    id: 'pubmed-eutils',
    kind: 'static',
    host: 'eutils.ncbi.nlm.nih.gov',
    requirement: 'optional',
    defaultEnabled: true,
    dataSentJa: 'PMID などの識別子と書誌検索条件。利用者の本文は送りません。',
    companyJa: '米国国立医学図書館（NCBI）',
    countryJa: 'アメリカ合衆国',
    recipientJa: recipient('米国国立医学図書館（NCBI）', 'アメリカ合衆国'),
    purposeJa: '文献識別子の照合'
  },
  {
    id: 'crossref',
    kind: 'static',
    host: 'api.crossref.org',
    requirement: 'optional',
    defaultEnabled: true,
    dataSentJa: 'DOI と書誌検索条件。利用者の本文は送りません。',
    companyJa: 'Crossref（Publishers International Linking Association）',
    countryJa: 'アメリカ合衆国',
    recipientJa: recipient(
      'Crossref（Publishers International Linking Association）',
      'アメリカ合衆国'
    ),
    purposeJa: '文献識別子の照合'
  },
  {
    id: 'telemetry',
    kind: 'static',
    host: 'stats.REPLACE_ME',
    requirement: 'optional',
    defaultEnabled: false,
    dataSentJa:
      'ランダムなインストール ID、アプリのバージョン、粗い OS、イベント名と回数。プロンプト、ファイル名、パス、モデル出力は送りません。',
    companyJa: '未定（プレースホルダー）',
    countryJa: '未定',
    recipientJa: recipient('未定（プレースホルダー）', '未定'),
    purposeJa: '利用状況統計（個人を特定しない）'
  }
]

const known: Record<string, { company: string; country: string; purpose: string; data: string }> = {
  'api.github.com': {
    company: 'GitHub, Inc.',
    country: 'アメリカ合衆国',
    purpose: 'スキルとリポジトリ情報の取得',
    data: 'リポジトリの参照に必要な識別子と API リクエスト。プロンプト本文は送りません。'
  },
  'github.com': {
    company: 'GitHub, Inc.',
    country: 'アメリカ合衆国',
    purpose: '公開リポジトリとリリースの参照',
    data: '公開リソースの URL。プロンプト本文は送りません。'
  },
  'huggingface.co': {
    company: 'Hugging Face',
    country: 'アメリカ合衆国',
    purpose: 'ローカルモデルのカタログとファイルの取得',
    data: 'モデル名とダウンロード要求。患者データは送りません。'
  },
  'statics.aipoch.com': {
    company: 'AIPOCH',
    country: '未記載',
    purpose: '製品の静的リソースと更新マニフェストの取得',
    data: 'アプリのバージョンとリソース名。文書本文は送りません。'
  }
}

const describe = (
  host: string
): { company: string; country: string; purpose: string; data: string } => {
  const preset = known[host]
  if (preset) return preset
  if (host.includes('ncbi') || host.includes('pubmed') || host.includes('pmc')) {
    return {
      company: '米国国立医学図書館（NCBI）',
      country: 'アメリカ合衆国',
      purpose: '生命科学・文献データの参照',
      data: '検索条件と公開識別子。利用者の本文は送りません。'
    }
  }
  if (
    host.includes('pypi') ||
    host.includes('npm') ||
    host.includes('conda') ||
    host.includes('anaconda')
  ) {
    return {
      company: '各パッケージレジストリの運営者',
      country: '未記載',
      purpose: '実行環境のパッケージ取得',
      data: 'パッケージ名とバージョン。研究データは送りません。'
    }
  }
  return {
    company: '各サービスの運営者',
    country: '未記載',
    purpose: 'アプリ機能のための外部通信',
    data: 'その機能のリクエスト。患者の自由記述やファイル名は、機能が明示しない限り送りません。'
  }
}

const slug = (host: string): string =>
  host
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const root = join(import.meta.dirname, '..')
const hits = collectOutboundHosts(root)
const specialHosts = new Set(specials.map((entry) => entry.host))
const staticEntries: Entry[] = [...specials]
const seenIds = new Set(specials.map((entry) => entry.id))
const exampleHosts: string[] = []

for (const hit of hits) {
  if (isModelCatalogHost(hit)) {
    exampleHosts.push(hit.host)
    continue
  }
  if (specialHosts.has(hit.host)) continue
  let id = slug(hit.host)
  while (seenIds.has(id)) id = `${id}-host`
  seenIds.add(id)
  const info = describe(hit.host)
  staticEntries.push({
    id,
    kind: 'static',
    host: hit.host,
    requirement: 'optional',
    defaultEnabled: false,
    dataSentJa: info.data,
    companyJa: info.company,
    countryJa: info.country,
    recipientJa: recipient(info.company, info.country),
    purposeJa: info.purpose
  })
}

const model: Entry = {
  id: 'model-endpoints',
  kind: 'user-configured-model',
  host: null,
  requirement: 'optional',
  defaultEnabled: false,
  disclosureNameJa: '利用者が設定した AI サービス',
  dataSentJa:
    '表の構造、合成サンプル、マスキングチェック済みの出力。承認されたプロジェクトでは、仮名化済み本文。法務レビュー前のプレースホルダーです。',
  companyJa: '利用者が選んだ提供者',
  countryJa: '提供者ごとに異なる',
  recipientJa: '利用者が選んだ提供者（提供者ごとに異なる）。法務レビュー前のプレースホルダーです。',
  purposeJa:
    '利用条件は、利用者が選んだ提供者の規約に従います。法務レビュー前のプレースホルダーです。',
  exampleHosts: exampleHosts.sort()
}

const document = {
  entries: [...staticEntries, model]
}
for (const entry of document.entries) {
  const text = JSON.stringify(entry)
  if (text.includes('【') || text.includes('】')) {
    throw new Error(`Placeholder bracket in ${entry.id}`)
  }
}

writeFileSync(
  join(root, 'resources', 'external-endpoints.json'),
  `${JSON.stringify(document, null, 2)}\n`
)
console.log(
  `entries ${document.entries.length} examples ${exampleHosts.length} scanned ${hits.length}`
)
