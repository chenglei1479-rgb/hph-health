import { parse, type DefaultTreeAdapterMap } from 'parse5'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { ToolDescriptor } from '@aipoch/connector-core'

type Node = DefaultTreeAdapterMap['node']
const SOURCES = {
  nbdc: 'https://humandbs.dbcls.jp/en/research/hum0014/v28',
  jenger: 'http://jenger.riken.jp/en/result'
} as const

function children(node: Node): Node[] {
  return 'childNodes' in node ? node.childNodes : []
}
function content(node: Node): string {
  if ('value' in node) return node.value
  if ('tagName' in node && ['script', 'style'].includes(node.tagName)) return ''
  return children(node).map(content).join(' ').replace(/\s+/g, ' ').trim()
}
function descendants(node: Node, tag: string): Node[] {
  return [
    ...('tagName' in node && node.tagName === tag ? [node] : []),
    ...children(node).flatMap((child) => descendants(child, tag))
  ]
}

const CONTROLLED_ACCESS = /制限あり|Controlled-access|controlled[- ]access/i
const UNRESTRICTED_ACCESS = /制限なし|Unrestricted-access|unrestricted[- ]access/i

export const NBDC_CONTROLLED_ACCESS_MESSAGE =
  'NBDC controlled-access data is refused. Only datasets marked 制限なし / Unrestricted-access are allowed.'

export function isUnrestrictedDataset(text: string): boolean {
  return UNRESTRICTED_ACCESS.test(text) && !CONTROLLED_ACCESS.test(text)
}

export function assertUnrestrictedAccess(text: string): void {
  if (CONTROLLED_ACCESS.test(text) || /\/controlled(?:\/|$)/i.test(text)) {
    throw new Error(NBDC_CONTROLLED_ACCESS_MESSAGE)
  }
}

// Do not interpret controlled-access genotype rows as downloadable summary statistics.
// HTTPS for jenger.riken.jp did not complete a TLS handshake on 2026-10-15, so the catalogue stays on http.
export function summaryLinks(
  html: string,
  source: keyof typeof SOURCES
): Array<{ title: string; url: string; accession: string | null; access: string }> {
  const root = parse(html)
  const rows: Array<{ title: string; url: string; accession: string | null; access: string }> = []
  const seen = new Set<string>()
  let sawControlled = false
  for (const row of descendants(root, 'tr')) {
    const title = content(row)
    if (source === 'nbdc' && CONTROLLED_ACCESS.test(title)) {
      sawControlled = true
      continue
    }
    if (source === 'nbdc' && (!isUnrestrictedDataset(title) || !/GWAS|summary/i.test(title)))
      continue
    for (const anchor of descendants(row, 'a')) {
      if (!('attrs' in anchor)) continue
      const href = anchor.attrs.find((attr) => attr.name === 'href')?.value
      if (!href) continue
      const url = new URL(href, SOURCES[source])
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) continue
      if (source === 'nbdc') {
        if (
          ![
            'humandbs.dbcls.jp',
            'humandbs.biosciencedbc.jp',
            'ddbj.nig.ac.jp',
            'www.ddbj.nig.ac.jp'
          ].includes(url.hostname)
        )
          continue
        if (!/NHA\d+/.test(content(anchor))) continue
      } else if (url.hostname !== 'jenger.riken.jp' || !/\/download\//.test(url.pathname)) continue
      if (seen.has(url.href)) continue
      seen.add(url.href)
      rows.push({
        title,
        url: url.href,
        accession: content(anchor).match(/NHA\d+/)?.[0] ?? null,
        access:
          source === 'nbdc'
            ? '制限なし / Unrestricted-access; review dataset terms'
            : 'Review JENGER terms'
      })
    }
  }
  if (!rows.length) {
    if (source === 'nbdc' && sawControlled) throw new Error(NBDC_CONTROLLED_ACCESS_MESSAGE)
    throw new Error(
      `${source}: no summary-statistic links parsed; upstream layout or access may have changed`
    )
  }
  return rows
}

export const HUMANGENETICS_BBJ_TOOLS: ToolDescriptor[] = [
  {
    id: 'bbj_summary_statistics',
    connector: 'human-genetics',
    description:
      'Discover BBJ summary-statistic dataset pages from NBDC hum0014 v28 or download links from JENGER. These are HTML catalogues, not stable JSON APIs. Returns source metadata, not full files. Genome build and effect allele must be confirmed from each file documentation. NBDC controlled-access genotype rows are excluded. No silent fallback on provider failure.',
    input: {
      type: 'object',
      properties: {
        source: { type: 'string', enum: ['nbdc', 'jenger'] },
        query: { type: 'string' },
        max_records: { type: 'integer', minimum: 1, maximum: 500, default: 100 }
      },
      required: ['source'],
      additionalProperties: false
    },
    returns:
      '{source, source_url, retrieved_at, genome_build:null, total, returned, truncated, datasets:[{title,url,accession,access}]}',
    example:
      "await host.mcp('human-genetics', 'bbj_summary_statistics', {source:'nbdc', query:'GWAS'})",
    run: async (ctx, args) => {
      const source = args.source as keyof typeof SOURCES
      if (!Object.hasOwn(SOURCES, source)) throw new Error('source must be nbdc or jenger')
      if (source === 'nbdc') assertUnrestrictedAccess(String(args.query ?? ''))
      const html = await ctx.fetchText(SOURCES[source], 'text/html')
      const query = String(args.query ?? '').toLowerCase()
      const rows = summaryLinks(html, source).filter((row) =>
        row.title.toLowerCase().includes(query)
      )
      const cap = Number(args.max_records ?? 100)
      if (!Number.isInteger(cap) || cap < 1 || cap > 500) throw new Error('invalid max_records')
      return {
        source,
        source_url: SOURCES[source],
        retrieved_at: new Date().toISOString(),
        genome_build: null,
        total: rows.length,
        returned: Math.min(cap, rows.length),
        truncated: rows.length > cap,
        datasets: rows.slice(0, cap)
      }
    }
  },
  {
    id: 'bbj_notebook_workflow',
    connector: 'human-genetics',
    description:
      'Get the packaged BBJ summary-statistic preparation and MR Notebook workflow paths. jMorp annotation uses a locally downloaded, versioned allele-frequency VCF after terms review; no undocumented jMorp API. GRCh37/38 conversion uses a local chain and target FASTA, retaining rejected rows. MR requires Notebook execution, research approval, an ancestry-matched local LD reference, and sample-overlap review.',
    input: { type: 'object', properties: {}, additionalProperties: false },
    returns:
      '{resource_directory, resource_found, notebook, preparation, mr_script, config, prerequisites, status}',
    example: "await host.mcp('human-genetics', 'bbj_notebook_workflow', {})",
    run: async () => {
      const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
      const candidates = [
        ...(resourcesPath
          ? [join(resourcesPath, 'app.asar.unpacked', 'resources', 'notebook', 'templates', 'bbj')]
          : []),
        join(process.cwd(), 'resources', 'notebook', 'templates', 'bbj'),
        join(__dirname, '..', '..', 'resources', 'notebook', 'templates', 'bbj')
      ]
      const directory = candidates.find((path) => existsSync(join(path, 'BBJ_MR.ipynb')))
      return {
        resource_directory: directory ?? null,
        resource_found: !!directory,
        notebook: 'BBJ_MR.ipynb',
        preparation: 'bbj_pipeline.py',
        mr_script: 'bbj_mr.R',
        config: 'config.example.json',
        status: 'template; no real-data MR executed',
        prerequisites: [
          'Python 3 / Jupyter kernel',
          'R + TwoSampleMR + ieugwasr + jsonlite + digest',
          'local PLINK executable and Japanese/EAS LD reference',
          'explicit source build and allele mapping',
          'reviewed jMorp panel terms/version/build',
          'chain + indexed target FASTA for cross-build conversion',
          'researcher-approved MR plan and sample-overlap review'
        ]
      }
    }
  }
]
