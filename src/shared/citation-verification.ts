// Checks PMID and DOI identifiers against public metadata. The text around a citation is compared
// locally and is never placed in a request.

export type CitationKind = 'pmid' | 'doi'
export type CitationStatus = 'verified' | 'mismatch' | 'not-found' | 'unverified'
export type CitationMismatchField = 'title' | 'author' | 'year'

export type CitationCheck = {
  kind: CitationKind
  id: string
  status: CitationStatus
  mismatches?: CitationMismatchField[]
}

export type CitationRecord = {
  title: string
  authors: string[]
  year?: number
}

type CachedRecord = CitationRecord | 'not-found' | 'unverified'

const PMID_PATTERN =
  /\b(?:PMID|PubMed)\s*[:#]?\s*(\d{1,8})\b|pubmed\.ncbi\.nlm\.nih\.gov\/(\d{1,8})\b/gi
const DOI_PATTERN = /\b(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+)/g
const TRAILING_DOI_PUNCTUATION = /[.,;:)\]]+$/
const MIN_REQUEST_GAP_MS = 350
const UNVERIFIED_TTL_MS = 60_000

const cache = new Map<string, { at: number; record: CachedRecord }>()
let requestChain: Promise<void> = Promise.resolve()
let nextRequestAt = 0

export const resetCitationVerificationState = (): void => {
  cache.clear()
  requestChain = Promise.resolve()
  nextRequestAt = 0
}

export const extractCitationIdentifiers = (
  text: string
): Array<{ kind: CitationKind; id: string; index: number }> => {
  const found: Array<{ kind: CitationKind; id: string; index: number }> = []
  const seen = new Set<string>()
  for (const match of text.matchAll(PMID_PATTERN)) {
    const id = match[1] ?? match[2]
    if (!id) continue
    const key = `pmid:${id}`
    if (seen.has(key)) continue
    seen.add(key)
    found.push({ kind: 'pmid', id, index: match.index ?? 0 })
  }
  for (const match of text.matchAll(DOI_PATTERN)) {
    const id = match[1]?.replace(TRAILING_DOI_PUNCTUATION, '')
    if (!id) continue
    const key = `doi:${id.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    found.push({ kind: 'doi', id: id.toLowerCase(), index: match.index ?? 0 })
  }
  return found.sort((left, right) => left.index - right.index)
}

export const pubmedSummaryUrl = (pmid: string): string => {
  if (!/^\d{1,8}$/.test(pmid)) throw new Error('Invalid PMID.')
  const url = new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi')
  url.searchParams.set('db', 'pubmed')
  url.searchParams.set('id', pmid)
  url.searchParams.set('retmode', 'json')
  url.searchParams.set('tool', 'dra')
  return url.toString()
}

export const crossrefWorkUrl = (doi: string): string => {
  if (!/^10\.\d{4,9}\/\S+$/.test(doi)) throw new Error('Invalid DOI.')
  return `https://api.crossref.org/works/${encodeURIComponent(doi)}`
}

const familyName = (value: string): string =>
  value.replace(/[.,]/g, ' ').trim().split(/\s+/)[0]?.toLowerCase() ?? ''

const titleTokens = (value: string): string[] =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 3)

const localClaims = (
  text: string,
  index: number
): { title?: string; author?: string; year?: number } => {
  const lineStart = text.lastIndexOf('\n', Math.max(0, index - 1)) + 1
  const window = text.slice(Math.max(lineStart, index - 180), index)
  const years = [...window.matchAll(/\b(?:19|20)\d{2}\b/g)]
  const year = years.at(-1)?.[0]
  const title = /["“]([^"”]{8,180})["”]/.exec(window)?.[1]
  const author = /([A-Z][A-Za-z'’-]{2,})\s+et al\.?/.exec(window)?.[1]
  return {
    ...(title ? { title } : {}),
    ...(author ? { author } : {}),
    ...(year ? { year: Number(year) } : {})
  }
}

export const compareCitationRecord = (
  record: CitationRecord,
  claims: { title?: string; author?: string; year?: number }
): CitationMismatchField[] => {
  const mismatches: CitationMismatchField[] = []
  if (claims.year !== undefined && record.year !== undefined && claims.year !== record.year) {
    mismatches.push('year')
  }
  if (claims.author) {
    const claimed = familyName(claims.author)
    const known = record.authors.some((author) => familyName(author) === claimed)
    if (!known) mismatches.push('author')
  }
  if (claims.title) {
    const claimed = titleTokens(claims.title)
    const recorded = new Set(titleTokens(record.title))
    const overlap = claimed.filter((token) => recorded.has(token)).length
    if (claimed.length > 0 && overlap * 2 < claimed.length) mismatches.push('title')
  }
  return mismatches
}

const yearFromText = (value: string | undefined): number | undefined => {
  const year = /\b(?:19|20)\d{2}\b/.exec(value ?? '')?.[0]
  return year ? Number(year) : undefined
}

export const parsePubmedSummary = (
  payload: unknown,
  pmid: string
): CitationRecord | 'not-found' => {
  const result = (payload as { result?: Record<string, unknown> } | undefined)?.result?.[pmid]
  if (!result || typeof result !== 'object') return 'not-found'
  const record = result as {
    error?: unknown
    title?: unknown
    authors?: unknown
    pubdate?: unknown
  }
  if (typeof record.error === 'string') return 'not-found'
  const authors = Array.isArray(record.authors)
    ? record.authors.flatMap((author) => {
        if (
          !author ||
          typeof author !== 'object' ||
          typeof (author as { name?: unknown }).name !== 'string'
        ) {
          return []
        }
        return [(author as { name: string }).name]
      })
    : []
  return {
    title: typeof record.title === 'string' ? record.title : '',
    authors,
    ...(yearFromText(typeof record.pubdate === 'string' ? record.pubdate : undefined) !== undefined
      ? { year: yearFromText(typeof record.pubdate === 'string' ? record.pubdate : undefined) }
      : {})
  }
}

export const parseCrossrefWork = (payload: unknown): CitationRecord | 'not-found' => {
  const message = (payload as { message?: unknown } | undefined)?.message
  if (!message || typeof message !== 'object') return 'not-found'
  const work = message as {
    title?: unknown
    author?: unknown
    issued?: { 'date-parts'?: unknown }
  }
  const title = Array.isArray(work.title) && typeof work.title[0] === 'string' ? work.title[0] : ''
  const authors = Array.isArray(work.author)
    ? work.author.flatMap((author) => {
        if (!author || typeof author !== 'object') return []
        const family = (author as { family?: unknown }).family
        return typeof family === 'string' ? [family] : []
      })
    : []
  const parts = work.issued?.['date-parts']
  const year = Array.isArray(parts) && Array.isArray(parts[0]) ? parts[0][0] : undefined
  return {
    title,
    authors,
    ...(typeof year === 'number' ? { year } : {})
  }
}

const pace = async (now: () => number): Promise<void> => {
  const turn = requestChain.then(
    () =>
      new Promise<void>((resolve) => {
        const wait = Math.max(0, nextRequestAt - now())
        nextRequestAt = now() + wait + MIN_REQUEST_GAP_MS
        setTimeout(resolve, wait)
      })
  )
  requestChain = turn.then(
    () => undefined,
    () => undefined
  )
  await turn
}

const readRecord = async (
  kind: CitationKind,
  id: string,
  fetchImpl: typeof fetch,
  now: () => number
): Promise<CachedRecord> => {
  const key = `${kind}:${id}`
  const cached = cache.get(key)
  if (cached && (cached.record !== 'unverified' || now() - cached.at < UNVERIFIED_TTL_MS)) {
    return cached.record
  }
  await pace(now)
  try {
    const response = await fetchImpl(kind === 'pmid' ? pubmedSummaryUrl(id) : crossrefWorkUrl(id), {
      method: 'GET',
      headers:
        kind === 'doi'
          ? {
              accept: 'application/json',
              'user-agent': 'DRA/citation-check (mailto:updates@example.invalid)'
            }
          : { accept: 'application/json' }
    })
    if (response.status === 404) {
      cache.set(key, { at: now(), record: 'not-found' })
      return 'not-found'
    }
    if (!response.ok) {
      cache.set(key, { at: now(), record: 'unverified' })
      return 'unverified'
    }
    const payload: unknown = await response.json()
    const record = kind === 'pmid' ? parsePubmedSummary(payload, id) : parseCrossrefWork(payload)
    cache.set(key, { at: now(), record })
    return record
  } catch {
    cache.set(key, { at: now(), record: 'unverified' })
    return 'unverified'
  }
}

export const verifyCitations = async (
  text: string,
  options: { fetchImpl?: typeof fetch; now?: () => number } = {}
): Promise<CitationCheck[]> => {
  const fetchImpl = options.fetchImpl ?? fetch
  const now = options.now ?? Date.now
  const identifiers = extractCitationIdentifiers(text)
  const checks: CitationCheck[] = []
  for (const identifier of identifiers) {
    const record = await readRecord(identifier.kind, identifier.id, fetchImpl, now)
    if (record === 'not-found') {
      checks.push({ kind: identifier.kind, id: identifier.id, status: 'not-found' })
      continue
    }
    if (record === 'unverified') {
      checks.push({ kind: identifier.kind, id: identifier.id, status: 'unverified' })
      continue
    }
    const mismatches = compareCitationRecord(record, localClaims(text, identifier.index))
    checks.push({
      kind: identifier.kind,
      id: identifier.id,
      status: mismatches.length > 0 ? 'mismatch' : 'verified',
      ...(mismatches.length > 0 ? { mismatches } : {})
    })
  }
  return checks
}

export const citationExportDecision = (
  checks: readonly CitationCheck[],
  overrideReason: string | undefined
): { allow: true; override?: { ids: string[]; reason: string } } | { allow: false } => {
  const blocked = checks.filter((check) => check.status === 'not-found')
  if (blocked.length === 0) return { allow: true }
  const reason = overrideReason?.trim() ?? ''
  if (reason.length < 3 || reason.length > 500) return { allow: false }
  return {
    allow: true,
    override: {
      ids: blocked.map((check) => `${check.kind}:${check.id}`),
      reason
    }
  }
}
