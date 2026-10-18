export type PhiCategory =
  | 'PERSON_NAME'
  | 'PHYSICIAN_NAME'
  | 'DATE'
  | 'ADDRESS'
  | 'PHONE'
  | 'EMAIL'
  | 'FACILITY'
  | 'KARTE_NO'
  | 'INSURER_NO'
  | 'INSURED_ID'
  | 'MY_NUMBER'

export type PhiKind = 'age' | 'document' | 'calendar'

export interface ParsedDate {
  y?: number
  m?: number
  d?: number
  style: string
}

export interface PhiSpan {
  start: number
  end: number
  category: PhiCategory
  text: string
  ageGe90?: boolean
  kind?: PhiKind
  labeled?: boolean
  shift?: boolean
  parsed?: ParsedDate
}

interface NormMap {
  normalized: string
  startOrig: number[]
  endOrig: number[]
  original: string
}

type IndexedMatch = RegExpExecArray & {
  indices: Array<[number, number] | undefined>
}

type SpanExtra = Partial<Pick<PhiSpan, 'ageGe90' | 'kind' | 'labeled' | 'shift' | 'parsed'>>
type ExtraArg = SpanExtra | ((chunk: string, match: IndexedMatch) => SpanExtra | false)

const EVAL_FALLBACK = '2026-10-13'

export function phiEvalDate(): Date {
  const raw = process.env.EVAL_DATE ?? EVAL_FALLBACK
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  if (!match) throw new Error(`EVAL_DATE must be YYYY-MM-DD, received ${raw}`)
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
}

const ERA: Array<[string, string, number]> = [
  ['令和', 'R', 2018],
  ['平成', 'H', 1988],
  ['昭和', 'S', 1925],
  ['大正', 'T', 1911],
  ['明治', 'M', 1867]
]

function normalizeWithMap(input: string): NormMap {
  const startOrig = []
  const endOrig = []
  let normalized = ''
  for (let i = 0; i < input.length;) {
    let len = 1
    const cp = input.charCodeAt(i)
    const next = input.charCodeAt(i + 1)
    if (cp >= 0xff66 && cp <= 0xff9d && (next === 0xff9e || next === 0xff9f)) len = 2
    const norm = input.slice(i, i + len).normalize('NFKC')
    for (let k = 0; k < norm.length; k++) {
      startOrig.push(i)
      endOrig.push(i + len)
    }
    normalized += norm
    i += len
  }
  return { normalized, startOrig, endOrig, original: input }
}

function mapSpan(map: NormMap, start: number, end: number): { start: number; end: number } | null {
  if (start >= end) return null
  return { start: map.startOrig[start], end: map.endOrig[end - 1] }
}

function addSpan(
  bucket: PhiSpan[],
  map: NormMap,
  nStart: number,
  nEnd: number,
  category: PhiCategory,
  extra: SpanExtra = {}
): void {
  let start = nStart
  let end = nEnd
  while (end > start && /\s/.test(map.normalized[end - 1])) end--
  while (start < end && /\s/.test(map.normalized[start])) start++
  const mapped = mapSpan(map, start, end)
  if (!mapped) return
  const text = map.original.slice(mapped.start, mapped.end)
  if (!text.trim()) return
  bucket.push({ ...mapped, category, text, ...extra })
}

function occupied(spans: PhiSpan[], start: number, end: number): boolean {
  return spans.some((span) => start < span.end && span.start < end)
}

function pushMatch(
  bucket: PhiSpan[],
  map: NormMap,
  norm: string,
  regex: RegExp,
  category: PhiCategory,
  group = 0,
  extra?: ExtraArg
): void {
  regex.lastIndex = 0
  let match: IndexedMatch | null
  while ((match = regex.exec(norm) as IndexedMatch | null)) {
    const chunk = group === 0 ? match[0] : match[group]
    if (chunk == null) continue
    const bounds = match.indices?.[group]
    if (!bounds) continue
    const start = bounds[0]
    const end = bounds[1]
    if (occupied(bucket, map.startOrig[start], map.endOrig[end - 1])) continue
    const extras = typeof extra === 'function' ? extra(chunk, match) : extra
    if (extras === false) continue
    addSpan(bucket, map, start, end, category, extras ?? {})
    if (regex.lastIndex === match.index) regex.lastIndex++
  }
}

function withIndices(pattern: string, flags = 'g'): RegExp {
  const flag = flags.includes('d') ? flags : flags + 'd'
  return new RegExp(pattern, flag)
}

const LAW = new Set([
  '01',
  '02',
  '06',
  '07',
  '31',
  '32',
  '33',
  '34',
  '39',
  '63',
  '67',
  '72',
  '73',
  '74',
  '75'
])

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

export function detectPhi(original: string): PhiSpan[] {
  const map = normalizeWithMap(original)
  const norm = map.normalized
  const spans: PhiSpan[] = []

  const take = (pattern: string, category: PhiCategory, group = 0, extra?: ExtraArg): void =>
    pushMatch(spans, map, norm, withIndices(pattern), category, group, extra)

  // Email before phone so addresses don't eat them.
  take('[A-Za-z0-9._%+\\-]+@[A-Za-z0-9.\\-]+\\.[A-Za-z]{2,}', 'EMAIL')

  // My Number: number only, labels stay outside the span.
  take(
    '(?:マイナンバーカード番号|マイナンバー|個人番号|My Number)\\s*[:：]?\\s*(\\d{4}(?:[\\s\\-・]\\d{4}){2}|\\d{8}\\n\\d{4}|\\d{4}\\s\\d{4}\\n\\d{4}|\\d{12})',
    'MY_NUMBER',
    1
  )
  take('(?<!\\d)(\\d{4}[\\s\\-・]\\d{4}[\\s\\-・]\\d{4})(?!\\d)', 'MY_NUMBER', 1)
  take('(?<!\\d)(\\d{4} \\d{4}\\n\\d{4})(?!\\d)', 'MY_NUMBER', 1)
  take('(?<!\\d)(\\d{8}\\n\\d{4})(?!\\d)', 'MY_NUMBER', 1)
  take('(?<!\\d)(\\d{12})(?!\\d)', 'MY_NUMBER', 1)

  // Insured identifiers. Labels 被保険者番号 / 受給者番号 stay outside.
  take('被保険者証記号\\s*\\S+\\s*番号\\s*\\S+(?:\\s*枝番\\s*\\S+)?', 'INSURED_ID')
  take(
    '記号\\s*[:：]?\\s*[^\\s（(]+(?:\\s|\\u3000)*番号\\s*[:：]?\\s*[^\\s（(]+(?:\\s*[（(]\\s*枝番\\s*\\d+\\s*[）)]|\\s*枝番\\s*\\d+)?',
    'INSURED_ID'
  )
  take('記号\\s*[・/]\\s*番号\\s*\\S+', 'INSURED_ID')
  take('(?<![\\d])(\\d{2,8}・\\d{2,8}(?:[（(]\\d{2}[）)])?)', 'INSURED_ID', 1)
  take('Insured ID:\\s*\\S+', 'INSURED_ID')
  take('被保険者番号\\s*(\\d{8})', 'INSURED_ID', 1)
  take('受給者番号\\s*(\\d{7,8})', 'INSURED_ID', 1)
  take('番号\\s*\\d+[（(]\\s*枝番\\s*\\d+\\s*[）)]', 'INSURED_ID')
  take(
    '[\\u4e00-\\u9fff\\u30a1-\\u30ffa-zA-Z0-9]{1,8}・[\\u4e00-\\u9fff\\u30a1-\\u30ffa-zA-Z0-9]{2,8}[（(]\\d{2}[）)]',
    'INSURED_ID'
  )

  // Insurer numbers. Keep the number, not the label.
  take('(?:国保\\s*)?保険者番号\\s*[:：=]?\\s*(\\d{6,9})(?!\\d)', 'INSURER_NO', 1)
  take('(?:国保\\s*)?保険者番号\\s*[:：=]?\\s*(\\d(?:[ \\u3000]\\d){5,8})(?!\\d)', 'INSURER_NO', 1)
  take(
    '(?:国保\\s*)?保険者番号\\s*[:：=]?\\s*(\\d{3,4}\\n\\d{3,4})(?!\\d)',
    'INSURER_NO',
    1,
    (chunk) => {
      const count = digitsOnly(chunk).length
      return count >= 6 && count <= 9 ? {} : false
    }
  )
  take('(?<![\\d\\w])保険者\\s+(\\d{6,8})', 'INSURER_NO', 1)
  take('公費負担者番号\\s*(\\d{8})', 'INSURER_NO', 1)
  take('負担者番号\\s*(\\d{8})', 'INSURER_NO', 1)
  take('Insurer No\\.\\s*(\\d{6,9})', 'INSURER_NO', 1)
  take('(?<![\\d])(\\d{2}-\\d{4}-\\d{2})(?!\\d)', 'INSURER_NO', 1, (chunk) =>
    LAW.has(chunk.slice(0, 2)) ? {} : false
  )
  take('保険\\s*[:：]\\s*(\\d{6,8})(?!\\d)', 'INSURER_NO', 1)
  take(
    '(?<![\\w\\u4e00-\\u9fff])([\\u4e00-\\u9fff\\u3040-\\u30ffA-Za-z0-9]{1,12}-\\d{3,8}-\\d{2})(?!\\d)',
    'INSURED_ID',
    1,
    (chunk) =>
      /^\d{4}-\d{1,2}-\d{1,2}$/.test(chunk) || /^\d{2}-\d{4}-\d{2}$/.test(chunk) ? false : {}
  )
  if (/^\d{8}$/.test(norm.trim()) && LAW.has(norm.trim().slice(0, 2))) {
    addSpan(spans, map, 0, norm.length, 'INSURER_NO')
  }
  if (/^\d{6}$/.test(norm.trim())) addSpan(spans, map, 0, norm.length, 'INSURER_NO')
  // Unlabeled law-code numbers that are the whole token.
  take('(?<![\\dA-Za-z])(\\d{8})(?!\\d)', 'INSURER_NO', 1, (chunk) =>
    LAW.has(chunk.slice(0, 2)) ? {} : false
  )

  // Chart numbers. Longer labels first.
  const karte: ReadonlyArray<readonly [string, number]> = [
    ['カルテ番号\\s*[:：]?\\s*(\\d+\\n\\d+|\\d{5,10})', 1],
    ['カルテNo\\.\\s*([A-Z]-\\d+)', 1],
    ['カルテ\\s+(\\d{5,10})', 1],
    ['患者番号\\s*[:：]\\s*(K\\d{5,})', 1],
    ['患者ID\\s*[:：]?\\s*(\\d{2,}(?:[\\s\\-]\\d{2,}){0,3})', 1],
    ['入院番号\\s*(IN\\d{2}-\\d{3,})', 1],
    ['外来ID\\s*[:：]?\\s*(OP-\\d+)', 1],
    ['病歴番号\\s*(\\d{2}-\\d{3,})', 1],
    ['診察券番号\\s*(\\d{6,})', 1],
    ['受付番号\\s*(\\d{6,}-\\d{2,})', 1],
    ['検体ID\\s*(S\\d{2}-\\d+)', 1],
    ['画像ID\\s*(CT\\d{4}-\\d+)', 1],
    ['MRN\\s+(\\d{5,})', 1],
    ['PID=(\\d{5,})', 1],
    ['No\\.\\s*(\\d{6,})', 1],
    ['(?<![A-Za-z])ID\\s*[:：]\\s*(\\d{4}-\\d{3,}|\\d{6,})', 1],
    ['(?<![A-Za-z])ID(\\d{6,})', 1],
    ['カルテ番号[^\\n|]{0,20}\\|(\\d{5,})', 1]
  ]
  for (const [pattern, group] of karte) take(pattern, 'KARTE_NO', group)

  // Phone.
  take('内線\\s*\\d{3,5}', 'PHONE')
  take('(?:TEL|Tel)\\s*\\+?\\d[\\d\\-\\s]{8,}\\d', 'PHONE')
  take('\\+81[\\-\\s]?\\d{1,4}[\\-\\s]?\\d{3,4}[\\-\\s]?\\d{3,4}', 'PHONE')
  take('(?<![\\d])0\\d{1,3}-\\d{2,4}-\\d{3,4}(?!\\d)', 'PHONE')
  take('(?<![\\d])0\\d{9,10}(?!\\d)', 'PHONE')

  // Address. A prefecture must be followed by a city and a street (丁目, 番地, 番+号,
  // or a hyphenated house number). A bare 番 or 号 is not enough: it also occurs in
  // chart numbers and drug names. The field label stays outside the span, and the
  // value stops before a phone or email on the same line.
  const prefecture =
    '北海道|青森県|岩手県|宮城県|秋田県|山形県|福島県|茨城県|栃木県|群馬県|埼玉県|千葉県|東京都|神奈川県|新潟県|富山県|石川県|福井県|山梨県|長野県|岐阜県|静岡県|愛知県|三重県|滋賀県|京都府|大阪府|兵庫県|奈良県|和歌山県|鳥取県|島根県|岡山県|広島県|山口県|徳島県|香川県|愛媛県|高知県|福岡県|佐賀県|長崎県|熊本県|大分県|宮崎県|鹿児島県|沖縄県'
  const locality = '(?:[\\u4e00-\\u9fff]{1,12}[市区町村郡]){1,4}'
  const street =
    '(?:[0-9一二三四五六七八九十百]+丁目(?:[0-9]+番(?:[0-9]+号)?)?(?:[0-9]+(?:-[0-9]+){1,2})?|[0-9]+番地(?:の[0-9]+)?|[0-9]+番[0-9]+号|[0-9]+(?:-[0-9]+){1,2})'
  const structured = `(?:${prefecture})${locality}(?:[\\u4e00-\\u9fffA-Za-z0-9]{0,16})?${street}`
  take(
    `(?:住所|Address)\\s*[:：]\\s*([^\\n]+?)(?=\\s*(?:Tel|TEL|電話|E-?mail|メール)\\b|\\n|$)`,
    'ADDRESS',
    1
  )
  take(`〒\\s*\\d{3}-?\\d{4}\\s*${structured}`, 'ADDRESS')
  take(structured, 'ADDRESS')
  take(
    '(?<![\\u30a1-\\u30faー])[\\u30a1-\\u30faー]{2,10}(?:ケン|フ|ト|ドウ)\\s+[\\u30a1-\\u30faー]{2,12}(?:シ|ク|グン|マチ|チョウ)',
    'ADDRESS'
  )
  take('病室番号\\s*[:：]?\\s*(\\d+(?:号室)?)', 'FACILITY', 1)
  take('病室\\s*[:：]?\\s*(\\d+号室)', 'FACILITY', 1)

  detectAgesAndDates(spans, map, norm)
  detectFacilities(spans, map, norm)
  detectNames(spans, map, norm)

  return resolve(spans)
}

function detectAgesAndDates(spans: PhiSpan[], map: NormMap, norm: string): void {
  const agePatterns: ReadonlyArray<readonly [string, boolean]> = [
    ['享年\\s*\\d{2,3}', true],
    ['満?\\d{2,3}\\s*歳\\s*\\d{1,2}\\s*か?月', false],
    ['満?\\d{2,3}\\s*\\n\\s*歳', false],
    ['満?\\d{2,3}\\s*歳(?:超|代)?', false],
    ['満?\\d{2,3}\\s*才', false],
    ['\\d{2,3}\\s*歳代', false],
    ['\\d{2,3}\\s*代(?:後半|前半)?', false],
    ['\\d{2,3}\\s*y\\s*/\\s*o', false],
    ['\\d{2,3}\\s*yo\\b', false],
    ['\\d{2,3}\\s*years old', false],
    ['(?:卒寿|白寿|百寿|茶寿|米寿)', false],
    ['満?百歳', false],
    ['[零〇一二三四五六七八九十百]{1,6}歳', false],
    ['年齢\\s*[:：]\\s*\\d{2,3}(?![\\d歳才y/])', true],
    ['Age\\s+\\d{2,3}(?![\\dy/歳才])', true]
  ]
  for (const [pattern, labeled] of agePatterns) {
    const regex = withIndices(pattern, 'g')
    let match: IndexedMatch | null
    while ((match = regex.exec(norm) as IndexedMatch | null)) {
      const start = match.index
      const end = match.index + match[0].length
      const orig = mapSpan(map, start, end)
      if (!orig || occupied(spans, orig.start, orig.end)) continue
      const age = ageValue(match[0])
      if (age == null) continue
      addSpan(spans, map, start, end, 'DATE', {
        ageGe90: age >= 90,
        kind: 'age',
        labeled
      })
    }
  }

  const datePatterns = [
    '(?:令和|平成|昭和|大正|明治)(?:元|\\d{1,2})年(?:\\d{1,2}月(?:\\d{1,2}日)?)?生?',
    '[MTS HR]\\d{1,2}\\.\\d{1,2}\\.\\d{1,2}生?',
    '\\d{4}年\\d{1,2}月\\d{1,2}日生?',
    '\\d{4}[.\\-/]\\d{1,2}[.\\-/]\\d{1,2}',
    '\\d{2}/\\d{2}/\\d{2}',
    '\\d{4}年\\d{1,2}月',
    '本年\\d{1,2}月',
    '(?<![\\d/])(\\d{1,2}月\\d{1,2}日)(?!\\d)',
    '(?<![\\d/])(\\d{1,2}/\\d{1,2})(?!\\d)'
  ]
  for (const pattern of datePatterns) {
    const regex = withIndices(pattern, 'g')
    let match: IndexedMatch | null
    while ((match = regex.exec(norm) as IndexedMatch | null)) {
      const chunk = match[1] ?? match[0]
      const start = match[1] ? match.indices[1][0] : match.index
      const end = match[1] ? match.indices[1][1] : match.index + match[0].length
      const orig = mapSpan(map, start, end)
      if (!orig || occupied(spans, orig.start, orig.end)) continue
      const parsed = parsePhiDate(chunk)
      if (!parsed) continue
      const before = norm.slice(Math.max(0, start - 16), start)
      const document =
        /(?:記載日|報告日|文書日付|作成日|研究期間|承認日|同意取得日)\s*[:：|]?\s*$/.test(before)
      const relative = /術後\s*$/.test(before)
      if (relative) continue
      const birth = /生$/.test(chunk) || /生年月日\s*[:：]\s*$/.test(before)
      let ageGe90
      if (birth && parsed.y) {
        const age = yearsOld(parsed, phiEvalDate())
        if (age != null) ageGe90 = age >= 90
      }
      addSpan(spans, map, start, end, 'DATE', {
        kind: document ? 'document' : birth && ageGe90 ? 'age' : 'calendar',
        shift: !document,
        ageGe90,
        parsed
      })
    }
  }
}

function kanjiNumber(text: string): number | null {
  const digits: Record<string, number> = {
    零: 0,
    〇: 0,
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9
  }
  if (text === '百') return 100
  let total = 0
  let current = 0
  for (const ch of text) {
    if (ch === '十') {
      total += (current || 1) * 10
      current = 0
    } else if (ch === '百') {
      total += (current || 1) * 100
      current = 0
    } else if (ch in digits) current = digits[ch]
    else return null
  }
  return total + current
}

function ageValue(text: string): number | null {
  const plain = text.replace(/\s+/g, '')
  if (/卒寿|白寿|百寿|茶寿|米寿|満?百歳|100歳超|100代|100歳代/.test(plain)) return 100
  const labeled = plain.match(/(?:年齢[:：]|Age|享年)(\d{2,3})/)
  if (labeled) return Number(labeled[1])
  const num = plain.match(/(\d{2,3})/)
  if (num) return Number(num[1])
  const kanji = plain.match(/([零〇一二三四五六七八九十百]+)歳/)
  if (kanji) return kanjiNumber(kanji[1])
  return null
}

function yearsOld(parsed: ParsedDate, on: Date): number | null {
  if (!parsed.y) return null
  const month = parsed.m ?? 12
  const day = parsed.d ?? 31
  let age = on.getUTCFullYear() - parsed.y
  if (on.getUTCMonth() + 1 < month || (on.getUTCMonth() + 1 === month && on.getUTCDate() < day))
    age--
  return age
}

export function parsePhiDate(text: string): ParsedDate | null {
  const source = text.replace(/生$/, '')
  const era = source.match(
    /^(令和|平成|昭和|大正|明治)(元|\d{1,2})年(?:(\d{1,2})月(?:(\d{1,2})日)?)?$/
  )
  if (era) {
    const base = ERA.find((item) => item[0] === era[1])
    if (!base) return null
    const year = era[2] === '元' ? 1 : Number(era[2])
    return {
      y: base[2] + year,
      m: era[3] ? Number(era[3]) : undefined,
      d: era[4] ? Number(era[4]) : undefined,
      style: text
    }
  }
  const abbrev = source.match(/^([MTSHR])(元|\d{1,2})\.(\d{1,2})\.(\d{1,2})$/)
  if (abbrev) {
    const base = ERA.find((item) => item[1] === abbrev[1])
    if (!base) return null
    const year = abbrev[2] === '元' ? 1 : Number(abbrev[2])
    return { y: base[2] + year, m: Number(abbrev[3]), d: Number(abbrev[4]), style: text }
  }
  const western = source.match(/^(\d{4})年(\d{1,2})月(?:(\d{1,2})日)?$/)
  if (western)
    return {
      y: Number(western[1]),
      m: Number(western[2]),
      d: western[3] ? Number(western[3]) : undefined,
      style: text
    }
  const sep = source.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/)
  if (sep) {
    const m = Number(sep[2])
    const d = Number(sep[3])
    if (m < 1 || m > 12 || d < 1 || d > 31) return null
    return { y: Number(sep[1]), m, d, style: text }
  }
  const y2 = source.match(/^(\d{2})\/(\d{2})\/(\d{2})$/)
  if (y2) {
    const m = Number(y2[2])
    const d = Number(y2[3])
    if (m < 1 || m > 12 || d < 1 || d > 31) return null
    return { y: 2000 + Number(y2[1]), m, d, style: text }
  }
  const md = source.match(/^(\d{1,2})月(\d{1,2})日$/)
  if (md) {
    const m = Number(md[1])
    const d = Number(md[2])
    if (m < 1 || m > 12 || d < 1 || d > 31) return null
    return { y: undefined, m, d, style: text }
  }
  const slash = source.match(/^(\d{1,2})\/(\d{1,2})$/)
  if (slash) {
    const m = Number(slash[1])
    const d = Number(slash[2])
    if (m < 1 || m > 12 || d < 1 || d > 31) return null
    return { y: undefined, m, d, style: text }
  }
  if (source === '本年' || /^本年\d{1,2}月$/.test(source)) {
    const month = source.match(/(\d{1,2})/)
    return {
      y: phiEvalDate().getUTCFullYear(),
      m: month ? Number(month[1]) : undefined,
      d: 1,
      style: text
    }
  }
  const yearMonth = source.match(/^(\d{4})年(\d{1,2})月$/)
  if (yearMonth) return { y: Number(yearMonth[1]), m: Number(yearMonth[2]), style: text }
  return null
}

function detectFacilities(spans: PhiSpan[], map: NormMap, norm: string): void {
  const org = '[\\u4e00-\\u9fff\\u3040-\\u30ffA-Za-zー々]'
  const pattern = `(?:医療法人${org}{1,8}\\s*)?(?:${org}+\\s*){1,3}(?:総合病院|病院|クリニック|薬局|訪問看護ステーション|特別養護老人ホーム|健診センター|病理診断センター|センター|倫理審査委員会)|\\d+階[東西南北]?病棟|南\\d+病棟|\\d+号室|ICU\\s*\\d+番ベッド|HCU|(?:循環器|脳神経|消化器|呼吸器|心臓血管)?(?:内科|外科)外来?|(?:循環器内科|脳神経内科|消化器外科|呼吸器内科|内科外来)`
  const regex = withIndices(pattern)
  let match: IndexedMatch | null
  while ((match = regex.exec(norm) as IndexedMatch | null)) {
    const orig = mapSpan(map, match.index, match.index + match[0].length)
    if (!orig || occupied(spans, orig.start, orig.end)) continue
    if (/病$/.test(match[0]) && !/病院$/.test(match[0])) continue
    addSpan(spans, map, match.index, match.index + match[0].length, 'FACILITY')
  }
}

function detectNames(spans: PhiSpan[], map: NormMap, norm: string): void {
  const nextField =
    '(?:年齢|享年|Age\\b|生年月日|カルテ|男性|女性|[MTSHR]\\d|昭和|平成|令和|大正|明治|\\d{4}年|\\d{1,3}\\s*(?:歳|才|y))'
  const stop = `(?=\\s*(?:${nextField}|$))`
  // One continuation line is part of the name when the age label is on the next line.
  const patient = withIndices(
    `患者(?:氏名|名|イニシャル)?\\s*[:|]\\s*([^\\n|]{1,80}?(?:\\n(?!\\s*${nextField})[^\\n]{1,16}?)?)${stop}`
  )
  let match: IndexedMatch | null
  while ((match = patient.exec(norm) as IndexedMatch | null)) {
    emitName(spans, map, match.indices[1][0], match.indices[1][1], 'PERSON_NAME')
  }
  const key = withIndices(
    'キーパーソン:\\s*(?:長女|長男|妻|夫|母|父|娘|息子)?\\s*([^\\n]+(?:\\n(?!担当|同居)[^\\n]+)?)'
  )
  while ((match = key.exec(norm) as IndexedMatch | null))
    emitName(spans, map, match.indices[1][0], match.indices[1][1], 'PERSON_NAME')
  const kin = withIndices(
    '(?:長男|長女)\\s+([^\\s（(\\n]{1,24}(?:[ \\t\\u3000]+[^\\s（(\\n]{1,24})?)'
  )
  while ((match = kin.exec(norm) as IndexedMatch | null)) {
    const orig = mapSpan(map, match.indices[1][0], match.indices[1][1])
    if (!orig || occupied(spans, orig.start, orig.end)) continue
    addSpan(spans, map, match.indices[1][0], match.indices[1][1], 'PERSON_NAME')
  }
  const daughter = withIndices('娘の([^\\sさん]{1,12})さん')
  while ((match = daughter.exec(norm) as IndexedMatch | null))
    addSpan(spans, map, match.indices[1][0], match.indices[1][1], 'PERSON_NAME')
  const honorific = withIndices(
    '(?<![\\u4e00-\\u9fff\\u30a1-\\u30fa])([\\u4e00-\\u9fff\\u30a1-\\u30fa]{1,8}(?:\\s+[\\u4e00-\\u9fff\\u30a1-\\u30fa]{1,8})?)さん'
  )
  while ((match = honorific.exec(norm) as IndexedMatch | null)) {
    const orig = mapSpan(map, match.indices[1][0], match.indices[1][1])
    if (!orig || occupied(spans, orig.start, orig.end)) continue
    addSpan(spans, map, match.indices[1][0], match.indices[1][1], 'PERSON_NAME')
  }
  const pt = withIndices("Pt:\\s*([A-Za-z][A-Za-z ,.'-]{1,40}?)\\s*[(（]([^)）]+)[)）]")
  while ((match = pt.exec(norm) as IndexedMatch | null)) {
    emitName(spans, map, match.indices[1][0], match.indices[1][1], 'PERSON_NAME')
    emitName(spans, map, match.indices[2][0], match.indices[2][1], 'PERSON_NAME')
  }
  const initial = withIndices('\\|([A-Z](?:\\.[A-Z])+\\.?)\\|')
  while ((match = initial.exec(norm) as IndexedMatch | null))
    addSpan(spans, map, match.indices[1][0], match.indices[1][1], 'PERSON_NAME')

  const roles =
    '(?:担当医|主治医|執刀医|助手|麻酔科医|指導医|研修医|看護師|薬剤師|検査技師|臨床検査技師|記載者|院長|研究責任者|署名|紹介元：[^\\n]{0,16}?院長|PI|Dr\\.|医師|CRC)'
  const roleRe = withIndices(`${roles}\\s*[:：]?\\s*([^\\n\\u3000（(]{1,24})`)
  while ((match = roleRe.exec(norm) as IndexedMatch | null)) {
    const name = match[1].replace(/\s*(先生|医師|部長).*$/, (suffix) => suffix)
    const local = match[0].lastIndexOf(match[1])
    const start = match.index + local
    const end = start + match[1].length
    if (occupied(spans, map.startOrig[start], map.endOrig[end - 1])) continue
    addSpan(spans, map, start, end, 'PHYSICIAN_NAME')
    void name
  }
  const suffix = withIndices('([\\u4e00-\\u9fff]{1,4})(医師|部長)(?![\\u4e00-\\u9fff])')
  while ((match = suffix.exec(norm) as IndexedMatch | null)) {
    addSpan(spans, map, match.index, match.index + match[0].length, 'PHYSICIAN_NAME')
  }

  if (norm.length <= 80 && spans.length === 0 && looksLikeName(norm.trim())) {
    addSpan(spans, map, 0, norm.length, rolePrefix(norm) ? 'PHYSICIAN_NAME' : 'PERSON_NAME')
  }
}

function rolePrefix(text: string): boolean {
  return /^(担当医|主治医|医師|研修医|看護師|薬剤師|検査技師|指導医|Dr\.|PI:|署名：|紹介元)/.test(
    text.trim()
  )
}

function looksLikeName(text: string): boolean {
  const value = text.trim()
  if (!value || value.startsWith('/') || /[0-9]{3,}|保険|番号|カルテ|@|県|市/.test(value)) {
    return false
  }
  if (/[\u4e00-\u9fff\u3040-\u30ff]/.test(value)) return true
  return /^[A-Za-z][A-Za-z' .-]{0,40}[, ][A-Za-z][A-Za-z' .-]{0,40}$/.test(value)
}

function emitName(
  spans: PhiSpan[],
  map: NormMap,
  start: number,
  end: number,
  category: PhiCategory
): void {
  const text = map.normalized.slice(start, end).trim()
  const pad = map.normalized.slice(start, end).length - text.length
  // trim was only the ends if trailing whitespace; recompute by searching trimmed text
  const at = map.normalized.slice(start, end).indexOf(text)
  const s = start + (at < 0 ? 0 : at)
  const e = s + text.length
  const reading = text.match(/^(.+?)[(（]([^)）]+)[)）]$/)
  addIfFree(spans, map, s, e, category)
  if (reading && category === 'PERSON_NAME') {
    const name = reading[1].trim()
    const yomi = reading[2].trim()
    const nameAt = text.indexOf(name)
    const yomiAt = text.lastIndexOf(yomi)
    addNested(spans, map, s + nameAt, s + nameAt + name.length, category)
    addNested(spans, map, s + yomiAt, s + yomiAt + yomi.length, category)
  }
  void pad
}

function addIfFree(
  spans: PhiSpan[],
  map: NormMap,
  start: number,
  end: number,
  category: PhiCategory
): void {
  const orig = mapSpan(map, start, end)
  if (!orig || occupied(spans, orig.start, orig.end)) return
  addSpan(spans, map, start, end, category)
}

function addNested(
  spans: PhiSpan[],
  map: NormMap,
  start: number,
  end: number,
  category: PhiCategory
): void {
  const orig = mapSpan(map, start, end)
  if (!orig) return
  addSpan(spans, map, start, end, category)
}

function resolve(spans: PhiSpan[]): PhiSpan[] {
  const rank: Record<PhiCategory, number> = {
    MY_NUMBER: 1,
    INSURED_ID: 2,
    INSURER_NO: 3,
    KARTE_NO: 4,
    EMAIL: 5,
    PHONE: 6,
    ADDRESS: 7,
    DATE: 8,
    FACILITY: 9,
    PHYSICIAN_NAME: 10,
    PERSON_NAME: 11
  }
  const sorted = [...spans].sort(
    (a, b) =>
      a.start - b.start ||
      b.end - b.start - (a.end - a.start) ||
      rank[a.category] - rank[b.category]
  )
  const kept: PhiSpan[] = []
  for (const span of sorted) {
    const clash = kept.find((item) => item.start < span.end && span.start < item.end)
    if (!clash) {
      kept.push(span)
      continue
    }
    // A reading inside parentheses is its own mention, nested under the full name.
    const nested =
      span.category === 'PERSON_NAME' &&
      clash.category === 'PERSON_NAME' &&
      span.start >= clash.start &&
      span.end <= clash.end &&
      (span.start > clash.start || span.end < clash.end)
    if (nested) kept.push(span)
  }
  return kept
}
