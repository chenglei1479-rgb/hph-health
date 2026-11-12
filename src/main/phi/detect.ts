import { isOrdinaryLabel } from './ordinary-label'

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
  /** Stable id of the rule that produced the span. Never contains matched text. */
  rule?: string
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

type SpanExtra = Partial<
  Pick<PhiSpan, 'ageGe90' | 'kind' | 'labeled' | 'shift' | 'parsed' | 'rule'>
>
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

// #175: NFKC folds full-width digits, brackets and `＋`, but it leaves the dash range alone — so a
// number typed as ０３−１２３４−５６７８ (U+2212 MINUS SIGN) folded every digit and still failed on the
// separator. Folding the whole dash family to the ASCII hyphen keeps this layer in step with the local
// redactor in `notebook/schema-only/patient-phi.ts`; both list the same characters.
const DASH_EQUIVALENTS = /[\u2010\u2011\u2013\u2014\u2015\u2212\uff0d]/gu

function normalizeWithMap(input: string): NormMap {
  const startOrig = []
  const endOrig = []
  let normalized = ''
  for (let i = 0; i < input.length;) {
    let len = 1
    const cp = input.charCodeAt(i)
    const next = input.charCodeAt(i + 1)
    if (cp >= 0xff66 && cp <= 0xff9d && (next === 0xff9e || next === 0xff9f)) len = 2
    // Each folded character stays one UTF-16 unit, so the offset map below is still exact.
    const norm = input
      .slice(i, i + len)
      .normalize('NFKC')
      .replace(DASH_EQUIVALENTS, '-')
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
  // Bare shapes: heuristics, so each carries a rule id for the block log.
  take('(?<!\\d)(\\d{4}[\\s\\-・]\\d{4}[\\s\\-・]\\d{4})(?!\\d)', 'MY_NUMBER', 1, {
    rule: 'my-number-bare-4x3'
  })
  take('(?<!\\d)(\\d{4} \\d{4}\\n\\d{4})(?!\\d)', 'MY_NUMBER', 1, {
    rule: 'my-number-bare-wrapped-space'
  })
  take('(?<!\\d)(\\d{8}\\n\\d{4})(?!\\d)', 'MY_NUMBER', 1, { rule: 'my-number-bare-8-4' })
  take('(?<!\\d)(\\d{12})(?!\\d)', 'MY_NUMBER', 1, { rule: 'my-number-bare-12' })

  // Insured identifiers. Labels 被保険者番号 / 受給者番号 stay outside. A rule that requires a label
  // records `labeled: true`: the machine-metadata exemption (#244) only releases *unlabeled* shapes,
  // because a labelled number in a workspace path is still a real identifier (#159).
  take('被保険者証記号\\s*\\S+\\s*番号\\s*\\S+(?:\\s*枝番\\s*\\S+)?', 'INSURED_ID', 0, {
    labeled: true
  })
  take(
    '記号\\s*[:：]?\\s*[^\\s（(]+(?:\\s|\\u3000)*番号\\s*[:：]?\\s*[^\\s（(]+(?:\\s*[（(]\\s*枝番\\s*\\d+\\s*[）)]|\\s*枝番\\s*\\d+)?',
    'INSURED_ID',
    0,
    { labeled: true }
  )
  take('記号\\s*[・/]\\s*番号\\s*\\S+', 'INSURED_ID', 0, { labeled: true })
  take('(?<![\\d])(\\d{2,8}・\\d{2,8}(?:[（(]\\d{2}[）)])?)', 'INSURED_ID', 1)
  take('Insured ID:\\s*\\S+', 'INSURED_ID', 0, { labeled: true })
  take('被保険者番号\\s*(\\d{8})', 'INSURED_ID', 1, { labeled: true })
  take('受給者番号\\s*(\\d{7,8})', 'INSURED_ID', 1, { labeled: true })
  take('番号\\s*\\d+[（(]\\s*枝番\\s*\\d+\\s*[）)]', 'INSURED_ID', 0, { labeled: true })
  take(
    '[\\u4e00-\\u9fff\\u30a1-\\u30ffa-zA-Z0-9]{1,8}・[\\u4e00-\\u9fff\\u30a1-\\u30ffa-zA-Z0-9]{2,8}[（(]\\d{2}[）)]',
    'INSURED_ID'
  )

  // Insurer numbers. Keep the number, not the label. Every rule carries a stable `rule` id so a
  // blocked hit can be traced to the pattern that produced it without logging any text.
  //
  // The labels accept a particle or one of the separators a real row uses: 保険者番号は 02123456,
  // 保険者番号 | 02123456, 保険者番号：02123456. `*` allows zero, so the forms that already worked
  // keep working. 保険者番号 and 被保険者番号 have no national check digit (unlike マイナンバー), so
  // the digits cannot be validated and only the label can carry the meaning.
  const LABEL_TAIL = '(?:は|が|[\\s:：=|｜])*'
  take(`(?:国保\\s*)?保険者番号${LABEL_TAIL}(\\d{6,9})(?!\\d)`, 'INSURER_NO', 1, {
    rule: 'insurer-no-labeled-digits'
  })
  take(`(?:国保\\s*)?保険者番号${LABEL_TAIL}(\\d(?:[ \\u3000]\\d){5,8})(?!\\d)`, 'INSURER_NO', 1, {
    rule: 'insurer-no-labeled-spaced'
  })
  take(
    `(?:国保\\s*)?保険者番号${LABEL_TAIL}(\\d{3,4}\\n\\d{3,4})(?!\\d)`,
    'INSURER_NO',
    1,
    (chunk) => {
      const count = digitsOnly(chunk).length
      return count >= 6 && count <= 9 ? { rule: 'insurer-no-labeled-wrapped' } : false
    }
  )
  take(`(?<![\\d\\w])保険者${LABEL_TAIL}(\\d{6,8})`, 'INSURER_NO', 1, {
    rule: 'insurer-no-insurer-word'
  })
  take(`公費負担者番号${LABEL_TAIL}(\\d{8})`, 'INSURER_NO', 1, {
    rule: 'insurer-no-public-expense'
  })
  take(`負担者番号${LABEL_TAIL}(\\d{8})`, 'INSURER_NO', 1, { rule: 'insurer-no-bearer' })
  take('Insurer No\\.\\s*(\\d{6,9})', 'INSURER_NO', 1, { rule: 'insurer-no-english' })
  take('(?<![\\d])(\\d{2}-\\d{4}-\\d{2})(?!\\d)', 'INSURER_NO', 1, (chunk) =>
    LAW.has(chunk.slice(0, 2)) ? { rule: 'insurer-no-grouped' } : false
  )
  take('保険\\s*[:：]\\s*(\\d{6,8})(?!\\d)', 'INSURER_NO', 1, {
    rule: 'insurer-no-insurance-colon'
  })
  take(
    '(?<![\\w\\u4e00-\\u9fff])([\\u4e00-\\u9fff\\u3040-\\u30ffA-Za-z0-9]{1,12}-\\d{3,8}-\\d{2})(?!\\d)',
    'INSURED_ID',
    1,
    (chunk) =>
      /^\d{4}-\d{1,2}-\d{1,2}$/.test(chunk) || /^\d{2}-\d{4}-\d{2}$/.test(chunk) ? false : {}
  )
  if (/^\d{8}$/.test(norm.trim()) && LAW.has(norm.trim().slice(0, 2))) {
    addSpan(spans, map, 0, norm.length, 'INSURER_NO', { rule: 'insurer-no-whole-8' })
  }
  if (/^\d{6}$/.test(norm.trim()))
    addSpan(spans, map, 0, norm.length, 'INSURER_NO', { rule: 'insurer-no-whole-6' })
  // Deliberately no rule for an eight-digit run *inside* a longer text. It read PMIDs, UUID segments
  // and record ids as insurer numbers and blocked the literature path; the fixture's bare law codes
  // are whole strings, which the two rules above still cover. Issue #105 records the trade-off.

  // Chart numbers. Longer labels first. The unlabeled patterns (No., ID, MRN, PID) carry a rule id:
  // those are the ones that can fire on a bare identifier with no label to read at the offset.
  const karte: ReadonlyArray<readonly [string, number, string?]> = [
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
    ['MRN\\s+(\\d{5,})', 1, 'karte-mrn'],
    ['PID=(\\d{5,})', 1, 'karte-pid'],
    ['No\\.\\s*(\\d{6,})', 1, 'karte-no'],
    ['(?<![A-Za-z])ID\\s*[:：]\\s*(\\d{4}-\\d{3,}|\\d{6,})', 1, 'karte-id-colon'],
    ['(?<![A-Za-z])ID(\\d{6,})', 1, 'karte-id-prefix'],
    ['カルテ番号[^\\n|]{0,20}\\|(\\d{5,})', 1]
  ]
  for (const [pattern, group, rule] of karte)
    take(pattern, 'KARTE_NO', group, rule ? { rule } : undefined)

  // Phone.
  take('内線\\s*\\d{3,5}', 'PHONE')
  take('(?:TEL|Tel)\\s*\\+?\\d[\\d\\-\\s]{8,}\\d', 'PHONE')
  take('\\+81[\\-\\s]?\\d{1,4}[\\-\\s]?\\d{3,4}[\\-\\s]?\\d{3,4}', 'PHONE', 0, {
    rule: 'phone-international'
  })
  // #171: a parenthesised area code hides the leading zero behind `(`, so the hyphenated rule below
  // never saw it. The area code must still start with `0`: widening it to any digits would take
  // `(2024)1234-5678` — a year in parentheses followed by two number groups — as a phone.
  take('(?<![\\d])\\(0\\d{1,4}\\)[\\-\\s]?\\d{2,4}-\\d{3,4}(?!\\d)', 'PHONE', 0, {
    rule: 'phone-parenthesized-area'
  })
  take('(?<![\\d])0\\d{1,3}-\\d{2,4}-\\d{3,4}(?!\\d)', 'PHONE', 0, {
    rule: 'phone-bare-hyphenated'
  })
  take('(?<![\\d])0\\d{9,10}(?!\\d)', 'PHONE', 0, { rule: 'phone-bare-digits' })

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

// #170: a mean age and a "per N years" ratio unit are statistics about a group, not a person's age.
// Both used to reach the gate as `age-sai`, and the gate refused the whole summary (beta.21 E27/E28
// reported an aggregate as a patient date). `kind` and `labeled` never survive to the gate, so the
// shape is recorded in the rule id — the only signal that reaches it — and the gate and deidentify
// treat exactly these two ids as non-patient.
//
// Only a fixed context releases an age. `65歳以上`, `10歳代`, `満65歳` and `年齢65歳` still name a person
// or a cohort member and keep `age-sai`; a mean or a rate denominator is what the context adds.
const AGGREGATE_AGE_RULES = new Set(['age-aggregate-mean', 'age-ratio-per-years'])

export const isAggregateAgeRule = (rule: string | undefined): boolean =>
  rule !== undefined && AGGREGATE_AGE_RULES.has(rule)

const MEAN_AGE_BEFORE = /平均年[齢令]\s*(?:[はがも：:]\s*)?$/u
const PER_YEARS_AFTER = /^\s*(?:当たり|あたり|当り)/u

const aggregateAgeRule = (text: string, start: number, end: number): string | null => {
  if (MEAN_AGE_BEFORE.test(text.slice(Math.max(0, start - 10), start))) return 'age-aggregate-mean'
  if (PER_YEARS_AFTER.test(text.slice(end, end + 6))) return 'age-ratio-per-years'
  return null
}

function detectAgesAndDates(spans: PhiSpan[], map: NormMap, norm: string): void {
  // Age shapes also carry a rule id now. Without one, a beta.20 block report named only
  // category/offset/length, and working out that `Age 18` came from the English age pattern took
  // three rounds of guessing at date patterns (#131).
  const agePatterns: ReadonlyArray<readonly [string, boolean, string]> = [
    ['享年\\s*\\d{2,3}', true, 'age-obituary'],
    ['満?\\d{2,3}\\s*歳\\s*\\d{1,2}\\s*か?月', false, 'age-month'],
    ['満?\\d{2,3}\\s*\\n\\s*歳', false, 'age-wrapped'],
    ['満?\\d{2,3}\\s*歳(?:超|代)?', false, 'age-sai'],
    ['満?\\d{2,3}\\s*才', false, 'age-sai-kanji'],
    ['\\d{2,3}\\s*歳代', false, 'age-sai-dai'],
    ['\\d{2,3}\\s*代(?:後半|前半)?', false, 'age-dai'],
    ['\\d{2,3}\\s*y\\s*/\\s*o', false, 'age-yo-slash'],
    ['\\d{2,3}\\s*yo\\b', false, 'age-yo'],
    ['\\d{2,3}\\s*years old', false, 'age-years-old'],
    ['(?:卒寿|白寿|百寿|茶寿|米寿)', false, 'age-longevity'],
    ['満?百歳', false, 'age-hundred'],
    ['[零〇一二三四五六七八九十百]{1,6}歳', false, 'age-kanji'],
    ['年齢\\s*[:：]\\s*\\d{2,3}(?![\\d歳才y/])', true, 'age-ja-label'],
    // A band label names nobody: `Age 18-39` is a group, while `Age 72` identifies a person. The
    // mark that follows the number is what tells them apart — not the word "Age" — so the match
    // stops at both spellings of an open end that real writing uses: the symbol (`-–—~〜～+`) and
    // the word (`and over`, `or older`, `years and over`, `plus`). Listing one without the other
    // leaves the incident reachable by rephrasing: "Age 80+" got through while "Age 80 and over"
    // stayed blocked, and the author sees the same failure either way.
    //
    // The word form only counts as a band when the phrase *ends* there. `Age 72 plus comorbidities`
    // is telegraphic clinical prose about one person, and an earlier version released it because
    // `\b` only stops a stuck-on suffix ("overall") — a whole following word still slipped through.
    // That turned a false block into a missed mask, which is the worse of the two. So the phrase
    // must be followed by no word on the same line: end of text, punctuation, or a line break.
    // The lookahead deliberately skips horizontal whitespace only, so a chart label ending a line
    // still reads as a band while "or older patients" does not. (`[^\S\n]*` rather than `\s*`:
    // a backtracking `\s*` can give back its space and let `[^A-Za-z]` match that space itself,
    // which re-releases exactly these sentences.)
    [
      'Age\\s+\\d{2,3}(?![\\dy/歳才])(?!\\s?(?:[-–—~〜～]\\s?\\d|\\+|to\\s?\\d))' +
        '(?!\\s+(?:years?\\s+)?(?:and|or)\\s+(?:over|above|older|more)\\b(?![^\\S\\n]*[A-Za-z]))' +
        '(?!\\s+plus\\b(?![^\\S\\n]*[A-Za-z]))',
      true,
      'age-english'
    ]
  ]
  for (const [pattern, labeled, rule] of agePatterns) {
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
        labeled,
        // A mean or a per-N-years unit keeps its own id so the gate can tell it from a person's age.
        rule: aggregateAgeRule(norm, start, end) ?? rule
      })
    }
  }

  // Date shapes carry no label, so each keeps a rule id: an offset alone does not say which pattern
  // produced it, and these are the patterns most likely to fire on a machine-generated string.
  const datePatterns: ReadonlyArray<readonly [string, string]> = [
    [
      '(?:令和|平成|昭和|大正|明治)(?:元|\\d{1,2})年(?:\\d{1,2}月(?:\\d{1,2}日)?)?生?',
      'date-bare-era'
    ],
    ['[MTS HR]\\d{1,2}\\.\\d{1,2}\\.\\d{1,2}生?', 'date-bare-abbrev'],
    ['\\d{4}年\\d{1,2}月\\d{1,2}日生?', 'date-bare-western-day'],
    ['\\d{4}[.\\-/]\\d{1,2}[.\\-/]\\d{1,2}', 'date-bare-iso'],
    ['\\d{2}/\\d{2}/\\d{2}', 'date-bare-two-digit-year'],
    ['\\d{4}年\\d{1,2}月', 'date-bare-western-month'],
    ['本年\\d{1,2}月', 'date-bare-current-year'],
    ['(?<![\\d/])(\\d{1,2}月\\d{1,2}日)(?!\\d)', 'date-bare-month-day'],
    ['(?<![\\d/])(\\d{1,2}/\\d{1,2})(?!\\d)', 'date-bare-slash']
  ]
  for (const [pattern, rule] of datePatterns) {
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
      // Labels whose date belongs to the document, not the person: `deidentify` leaves those alone, and
      // on main the blocking layer was what kept them off the wire. `同意取得日` is deliberately not in
      // this list (#264): consent acquisition is the patient's timeline, so that date is shifted like any
      // other calendar date. Nothing in the export relies on it staying readable.
      const document =
        /(?:記載日|報告日|文書日付|作成日|研究期間|承認日)\s*[:：|]?\s*$/.test(before)
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
        parsed,
        rule
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
  // A bare `氏名:` cell. The whole-string guess used to return the whole cell as one span, which hid
  // the label and made exact recall depend on a heuristic; keep the label outside the span here.
  const labeled = withIndices(
    `(?:患者氏名|患者名|氏名)\\s*[:：]\\s*([^\\n\\t|]{1,40}?)(?=\\s*(?:${nextField})|\\s*$|[\\n\\u3000])`
  )
  while ((match = labeled.exec(norm) as IndexedMatch | null)) {
    const bounds = match.indices[1]
    if (bounds) emitName(spans, map, bounds[0], bounds[1], 'PERSON_NAME')
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

  // ASCII role tokens must stand alone. Without the left boundary the `PI` inside `API` matched, and the
  // 24-character capture that follows then swallowed English prose ("API route definitions ...") as a
  // physician name; the application's own instructions arrived as `[職員N]` replacements and the review
  // window asked a doctor to check our prompt (#160). Japanese labels keep their existing shape.
  const japaneseRoles =
    '(?:担当医|主治医|執刀医|助手|麻酔科医|指導医|研修医|看護師|薬剤師|検査技師|臨床検査技師|記載者|院長|研究責任者|署名|紹介元：[^\\n]{0,16}?院長|医師)'
  const asciiRoles = '(?<![A-Za-z])(?:PI|CRC|Dr\\.)(?![A-Za-z0-9])'
  const roleRe = withIndices(
    `(?:${japaneseRoles}|${asciiRoles})\\s*[:：]?\\s*([^\\n\\u3000（(]{1,24})`
  )
  while ((match = roleRe.exec(norm) as IndexedMatch | null)) {
    const name = match[1].replace(/\s*(先生|医師|部長).*$/, (suffix) => suffix)
    const local = match[0].lastIndexOf(match[1])
    const start = match.index + local
    const end = start + match[1].length
    if (occupied(spans, map.startOrig[start], map.endOrig[end - 1])) continue
    addSpan(spans, map, start, end, 'PHYSICIAN_NAME', { rule: 'role-label-name' })
    void name
  }
  const suffix = withIndices('([\\u4e00-\\u9fff]{1,4})(医師|部長)(?![\\u4e00-\\u9fff])')
  while ((match = suffix.exec(norm) as IndexedMatch | null)) {
    addSpan(spans, map, match.index, match.index + match[0].length, 'PHYSICIAN_NAME')
  }

  detectUnlabeledNames(spans, map, norm)
}

function rolePrefix(text: string): boolean {
  return /^(担当医|主治医|医師|研修医|看護師|薬剤師|検査技師|指導医|Dr\.|PI:|署名：|紹介元)/.test(
    text.trim()
  )
}

// ---------------------------------------------------------------------------
// Unlabeled names in short text
// ---------------------------------------------------------------------------

// The guess is the only rule in this file without a label or a structured shape, so it is the only
// one that can invent a patient. It keeps the 80-character window it always had, but two things
// changed:
//   * it runs per tab cell and per gap left by the spans the labelled rules already found, so a name
//     that shares a row with an age or a date is seen (any other span used to suppress it entirely);
//   * it masks only the segments that are name-shaped, so a dictionary row no longer loses its field
//     names, units and codings to a single `[患者N]`.
const GUESS_MAX_LENGTH = 80

// Separators inside a cell, in the normalized forms NFKC leaves behind (（）／，：； fold to ()/,:;).
// Never split on ・ (U+30FB), a space, a full-width space (U+3000), ～ or -, which all occur inside
// names (ジョン・スミス, 山田 太郎, 山田-太郎).
const SEGMENT_SEPARATOR = /[()/,:;、。=\n\r]/u

// Field labels that the labelled rules above already understand, taken from the literals those rules
// match. A label is never a name: its value is masked separately, so masking the label would delete
// the exporter's field name while protecting nothing. Everything outside this list stays fail-closed.
const LABEL_TOKEN = new RegExp(
  `^(?:${[
    '患者氏名',
    '患者名',
    '患者',
    '氏名',
    '患者イニシャル',
    'キーパーソン',
    '長男',
    '長女',
    '担当医',
    '主治医',
    '執刀医',
    '助手',
    '麻酔科医',
    '指導医',
    '研修医',
    '看護師',
    '薬剤師',
    '検査技師',
    '臨床検査技師',
    '記載者',
    '院長',
    '研究責任者',
    '署名',
    'PI',
    'Dr\\.',
    '医師',
    'CRC',
    '年齢',
    '享年',
    'Age',
    '生年月日',
    '記載日',
    '報告日',
    '文書日付',
    '作成日',
    '研究期間',
    '承認日',
    '同意取得日',
    '術後',
    'カルテ番号',
    'カルテNo\\.',
    'カルテ',
    '患者番号',
    '患者ID',
    '入院番号',
    '外来ID',
    '病歴番号',
    '診察券番号',
    '受付番号',
    '検体ID',
    '画像ID',
    'MRN',
    'PID',
    'No\\.',
    'ID',
    '保険者番号',
    '国保',
    '公費負担者番号',
    '負担者番号',
    'Insurer No\\.',
    '保険',
    '被保険者証記号',
    '記号',
    '番号',
    '枝番',
    'Insured ID',
    '被保険者番号',
    '受給者番号',
    'マイナンバー',
    '個人番号',
    'マイナンバーカード番号',
    'My Number',
    '住所',
    'Address',
    '病室番号',
    '病室',
    '内線',
    'TEL',
    'Tel',
    '電話',
    'メール',
    'E-mail'
  ].join('|')})$`,
  'u'
)

// A parenthesised slot holding a unit, a bare number, a date or a phone is a value slot, not a name.
const UNIT_SLOT = new Set([
  '歳',
  '才',
  '年',
  'ヶ月',
  'か月',
  '月',
  '日',
  '週',
  '時間',
  '分',
  '秒',
  'cm',
  'mm',
  'm',
  'km',
  'kg',
  'g',
  'mg',
  'μg',
  'mL',
  'ml',
  'L',
  'dL',
  '%',
  '％',
  'mmHg',
  'bpm',
  '回',
  '名',
  '例',
  '件',
  '点',
  '個',
  '本',
  '人',
  '倍',
  '度',
  '円',
  '号',
  '室'
])

const HONORIFIC_TAIL = /(?:様|さん|先生|氏|ちゃん)$/u
// 々 (U+3005) and 〆 (U+3006) occur inside surnames, and so does a hyphen (山田-太郎), so all three
// count as part of a name here. A hyphen is never a segment separator for the same reason.
const KANJI_KATAKANA_PART = /^[\u4e00-\u9fff\u3005\u3006\u30a0-\u30ffー\u2010-]{1,16}$/u
// #244: a name part is short, but the bound has to sit between the longest reviewed name and the
// shortest clause the incident showed. The reviewed names top out at five kanji (椎名凛太郎); the
// incident's first false name was nine characters (暂时不需要任何信息), so eight keeps 7-8 character
// names (勅使河原剛太朗) and still rejects every false shape (9/12/14/15/24). A part that carries
// katakana keeps the old bound (アレクサンダー, タカサゴヤ・タクミ), because length is what tells a
// foreign name apart from a clause.
const KATAKANA_IN_PART = /[\u30a0-\u30ffー]/u
const KANJI_PART_MAX_LENGTH = 8
const isKanjiNamePart = (part: string): boolean =>
  KANJI_KATAKANA_PART.test(part) &&
  (KATAKANA_IN_PART.test(part) || part.length <= KANJI_PART_MAX_LENGTH)
const HIRAGANA_PART = /^[\u3040-\u309f]{1,8}$/u
const LATIN_PART = /^[A-Z][A-Za-z'.-]*$/u
const LATIN_COMMA_PAIR =
  /(?<![A-Za-z])([A-Z][A-Za-z'.-]{1,15}\s*,\s*[A-Z][A-Za-z'.-]{1,15})(?![A-Za-z])/u
const SEGMENT_EDGE = /^[\s"'`{}[\]]+|[\s"'`{}[\]]+$/gu

// #244: an unlabeled segment is masked only when it can be a personal name. A Chinese function
// character never occurs in a Japanese name, and the Japanese particles are kana (the hiragana path
// handles those). 和, 与, 将, 及, 满, 后 and 之 are deliberately absent — do not add them back as an
// "obvious" extension of this set: 和 appears in the reviewed 鈴森 和子, 及川 / 将太 / 与一 are real
// names, 满 / 后 are Chinese surnames and 之 is a common given-name character. Vetoing any of them
// would leave a real name unmasked, and an unmasked name is the unsafe side of this trade.
const CJK_FUNCTION_CHARACTER = /[的了着是把被并或不需另]/u
// #244: the beta.23 build blocked an agent plan line at 明确研究问题 (offset 41, length 6 of a
// 78-character field). It is a verb-object clause with no particle, so the length bound alone cannot reject it
// without losing the seven/eight-character names #244 kept. A personal name does not end in a
// research/document noun; these are the domain words an agent's own plan uses. Each is checked against
// all 85 reviewed PERSON_NAME texts (105 main gold + 15 short-record gold + 70 entities): none ends
// with one of them.
const CJK_PROSE_SUFFIXES = [
  '问题',
  '数据',
  '证据',
  '事项',
  '流程',
  '阶段',
  '结果',
  '信息',
  '内容',
  '方法',
  '计划',
  '风险',
  '因素',
  '标准',
  '目标',
  '方案',
  '步骤',
  '范围',
  '来源',
  '需求',
  '要求',
  '建议',
  '意见',
  '结论',
  '摘要',
  '背景',
  '目的',
  '情况',
  '状态',
  '记录',
  '报告',
  '草稿',
  '文档',
  '文件',
  '列表',
  '清单',
  '表格',
  '图表',
  '思路',
  '可行性',
  '科研',
  '研究',
  '分析',
  '检索',
  '确认',
  '修改',
  '测试',
  '工具',
  '时间窗',
  '终点',
  '之后'
] as const

// Short whole messages a user sends by themselves, captured from the stored sessions where the guess
// masked them. They are not suffix patterns (a name could not end with one) and not particles.
const CJK_COMMON_NON_NAME = new Set(['继续', '挨拶'])

const isProseClause = (value: string): boolean =>
  CJK_FUNCTION_CHARACTER.test(value) ||
  CJK_PROSE_SUFFIXES.some((suffix) => value.endsWith(suffix)) ||
  // Whole-message imperatives/greetings observed in real sessions (继续, 挨拶). A personal name never
  // equals one of these; this is the reviewed-vocabulary path, not a length rule.
  CJK_COMMON_NON_NAME.has(value)

function isNameShaped(text: string): boolean {
  const value = text.trim()
  if (!value || value.startsWith('/') || /[0-9]{3,}|保険|番号|カルテ|@|県|市/u.test(value))
    return false
  if (isProseClause(value)) return false
  // A trailing honorific belongs to the span but not to the shape.
  const parts = value
    .replace(HONORIFIC_TAIL, '')
    .trim()
    .split(/[\s\u3000]+/u)
    .filter(Boolean)
  if (parts.length === 0 || parts.length > 4) return false
  // A Japanese name may mix scripts across its parts: 小鳥遊 ゆかり, 柊 ハルル, やまだ たろう.
  // A single part must carry kanji or katakana: one hiragana word is prose ("こんにちは").
  if (
    parts.every((part) => isKanjiNamePart(part) || HIRAGANA_PART.test(part)) &&
    parts.join('').length >= 2
  )
    return parts.length >= 2 || isKanjiNamePart(parts[0])
  if (parts.length >= 2 && parts.every((part) => LATIN_PART.test(part))) return true
  return false
}

// A parenthesised slot holding a bare number, a date format or a phone is a value: it is the value of
// the cell, and its own detector (DATE, PHONE, KARTE) already covers it.
function isValueSlot(slot: string): boolean {
  const value = slot.trim()
  if (!value || value.length > 24) return false
  if (/^[0-9]+$/u.test(value)) return true
  if (/^[0-9][0-9\s\-./:]*$/u.test(value)) return true
  if (/^[ymdYMD][ymdYMD/\-.]*$/u.test(value)) return true
  return false
}

// A cell whose parenthesised slots are all units is a measurement definition — 年齢（歳）,
// 収縮期血圧（mmHg）, 投与量（mg） — and no part of it can be a name. That is a unit table, not a list of
// people, so the whole cell is released.
function isUnitCell(text: string): boolean {
  const slots = [...text.matchAll(/\(([^()]*)\)/gu)]
  return slots.length > 0 && slots.every((slot) => UNIT_SLOT.has(slot[1].trim()))
}

// The converse must not release the rest of the cell: "John Smith (MD)" and "連絡先（03-1234-5678）"
// carry a value in the parentheses and a label or a name outside it. Those slots are treated as
// occupied intervals and everything outside them is judged as usual — the same rule the spans use.
function valueSlotRanges(text: string, offset: number): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = []
  for (const slot of text.matchAll(/\(([^()]*)\)/gu)) {
    if (UNIT_SLOT.has(slot[1].trim()) || !isValueSlot(slot[1])) continue
    const start = offset + (slot.index ?? 0)
    ranges.push({ start, end: start + slot[0].length })
  }
  return ranges
}

function splitRanges(
  norm: string,
  separator: RegExp,
  start: number,
  end: number
): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = []
  let cursor = start
  for (let i = start; i < end; i++) {
    separator.lastIndex = 0
    if (!separator.test(norm[i])) continue
    ranges.push({ start: cursor, end: i })
    cursor = i + 1
  }
  ranges.push({ start: cursor, end })
  return ranges
}

function normalizedRange(map: NormMap, span: PhiSpan): { start: number; end: number } | null {
  let start = -1
  let end = -1
  for (let i = 0; i < map.startOrig.length; i++) {
    if (map.startOrig[i] < span.start || map.endOrig[i] > span.end) continue
    if (start < 0) start = i
    end = i + 1
  }
  return start < 0 ? null : { start, end }
}

function freeRanges(
  spans: PhiSpan[],
  map: NormMap,
  cell: { start: number; end: number },
  extra: ReadonlyArray<{ start: number; end: number }> = []
): Array<{ start: number; end: number }> {
  let ranges = [cell]
  const blocked: Array<{ start: number; end: number }> = [...extra]
  for (const span of spans) {
    const range = normalizedRange(map, span)
    if (range) blocked.push(range)
  }
  for (const range of blocked) {
    if (range.end <= cell.start || cell.end <= range.start) continue
    const next: Array<{ start: number; end: number }> = []
    for (const item of ranges) {
      if (range.end <= item.start || item.end <= range.start) {
        next.push(item)
        continue
      }
      if (item.start < range.start) next.push({ start: item.start, end: range.start })
      if (range.end < item.end) next.push({ start: range.end, end: item.end })
    }
    ranges = next
  }
  return ranges
}

// The name inside a segment. A cell may hold a reviewed label next to the name it describes
// ("男性 John Smith"); the label is not a name, so it is peeled before the shape test and only the
// remaining run is masked.
function nameRun(core: string): { start: number; end: number } | null {
  if (isNameShaped(core)) return { start: 0, end: core.length }
  const parts = [...core.matchAll(/[^\s\u3000]+/gu)].map((match) => ({
    text: match[0],
    start: match.index,
    end: match.index + match[0].length
  }))
  for (let first = 0; first < parts.length; first++) {
    for (let last = first + 1; last <= parts.length; last++) {
      const inner = parts.slice(first, last)
      if (!isNameShaped(inner.map((part) => part.text).join(' '))) continue
      const outside = [...parts.slice(0, first), ...parts.slice(last)]
      if (!outside.every((part) => isOrdinaryLabel(part.text) || LABEL_TOKEN.test(part.text)))
        continue
      return { start: inner[0].start, end: inner[inner.length - 1].end }
    }
  }
  return null
}

function guessSegment(
  spans: PhiSpan[],
  map: NormMap,
  norm: string,
  start: number,
  end: number
): void {
  const raw = norm.slice(start, end)
  const head = /^[\s"'`{}[\]]*/u.exec(raw)?.[0].length ?? 0
  const core = raw.replace(SEGMENT_EDGE, '')
  if (!core) return
  if (LABEL_TOKEN.test(core)) return
  const candidate = nameRun(core)
  if (!candidate) return
  const from = start + head + candidate.start
  const to = start + head + candidate.end
  if (to > norm.length) return
  const text = norm.slice(from, to)
  if (isOrdinaryLabel(text)) return
  if (occupied(spans, map.startOrig[from], map.endOrig[to - 1])) return
  addSpan(spans, map, from, to, rolePrefix(text) ? 'PHYSICIAN_NAME' : 'PERSON_NAME', {
    rule: 'guess-segment'
  })
}

function maskLatinCommaPair(
  spans: PhiSpan[],
  map: NormMap,
  norm: string,
  gap: { start: number; end: number }
): void {
  // ROMANIZED surnames are exported as SURNAME,GIVEN. A comma is a segment separator, so the pair
  // would otherwise be judged as two one-word tokens and dropped.
  const text = norm.slice(gap.start, gap.end)
  const match = LATIN_COMMA_PAIR.exec(text)
  if (!match) return
  const from = gap.start + match.index
  const to = from + match[1].length
  if (occupied(spans, map.startOrig[from], map.endOrig[to - 1])) return
  addSpan(spans, map, from, to, 'PERSON_NAME', { rule: 'latin-comma-pair' })
}

function detectUnlabeledNames(spans: PhiSpan[], map: NormMap, norm: string): void {
  if (norm.length > GUESS_MAX_LENGTH) return
  // The original rule, unchanged: a text that is nothing but a name is a name. Everything below only
  // adds back the segments the labelled rules cannot reach.
  const whole = norm.trim()
  if (spans.length === 0 && whole && isNameShaped(whole) && !isOrdinaryLabel(whole)) {
    const from = norm.indexOf(whole)
    addSpan(
      spans,
      map,
      from,
      from + whole.length,
      rolePrefix(whole) ? 'PHYSICIAN_NAME' : 'PERSON_NAME',
      {
        rule: 'guess-whole'
      }
    )
  }
  for (const cell of splitRanges(norm, /\t/u, 0, norm.length)) {
    const text = norm.slice(cell.start, cell.end)
    if (!text.trim()) continue
    if (isUnitCell(text)) continue
    for (const gap of freeRanges(spans, map, cell, valueSlotRanges(text, cell.start))) {
      maskLatinCommaPair(spans, map, norm, gap)
      for (const segment of splitRanges(norm, SEGMENT_SEPARATOR, gap.start, gap.end)) {
        guessSegment(spans, map, norm, segment.start, segment.end)
      }
    }
  }
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
  // A second rule finding the same name must not add the reading twice; the nested spans below are
  // added without an occupancy check because they sit inside the outer one.
  if (!addIfFree(spans, map, s, e, category)) return
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
): boolean {
  const orig = mapSpan(map, start, end)
  if (!orig || occupied(spans, orig.start, orig.end)) return false
  addSpan(spans, map, start, end, category)
  return true
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
