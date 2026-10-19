// Deliberately narrower than main's whole-string-name-guess exception. This is a categorized
// vocabulary reviewed for categorical output, aggregate tables and literature queries;
// never infer that an arbitrary short Japanese string is an ordinary label.
export const ORDINARY_LABEL_VOCABULARY = {
  sex: ['男性', '女性', '男', '女', 'その他', '不明'],
  yesNo: ['あり', 'なし', '有', '無', 'はい', 'いいえ', '陽性', '陰性'],
  disease: [
    '肺癌',
    '胃癌',
    '糖尿病',
    '高血圧',
    '大腸癌',
    '乳癌',
    '肝癌',
    '膵癌',
    '喘息',
    '肺炎',
    '心不全',
    '脳梗塞',
    '慢性腎臓病',
    '脂質異常症'
  ],
  department: [
    '内科',
    '外科',
    '小児科',
    '整形外科',
    '皮膚科',
    '眼科',
    '耳鼻咽喉科',
    '産婦人科',
    '精神科',
    '泌尿器科',
    '脳神経外科',
    '循環器内科',
    '消化器内科',
    '呼吸器内科',
    '神経内科',
    '腎臓内科',
    '血液内科',
    '糖尿病内科',
    '心臓血管外科',
    '呼吸器外科',
    '消化器外科',
    '形成外科',
    '麻酔科',
    '放射線科',
    '救急科',
    'リハビリテーション科'
  ],
  medicalSearch: [
    '無作為化比較試験',
    '観察研究',
    'メタ解析',
    '生存率',
    '化学療法',
    '免疫療法',
    '放射線療法',
    '有害事象',
    '再発',
    '予後'
  ]
} as const

const ORDINARY_LABELS = new Set<string>(Object.values(ORDINARY_LABEL_VOCABULARY).flat())
// Only bounded directions, ward numbers, or floor numbers; arbitrary names never qualify.
const MAX_WARD_LABEL_LENGTH = 8
const WARD = /^(?:東|西|南|北|北東|北西|南東|南西|[0-9０-９〇一二三四五六七八九十百]+階?)病棟$/u

export const isOrdinaryLabel = (text: string): boolean => {
  const value = text.trim()
  return ORDINARY_LABELS.has(value) || (value.length <= MAX_WARD_LABEL_LENGTH && WARD.test(value))
}

export function isOrdinaryLabelAggregate(text: string): boolean {
  if (isOrdinaryLabel(text)) return true
  const rows = text
    .trim()
    .split(/\r?\n/)
    .map((row) => row.split(',').map((cell) => cell.trim()))
  if (rows.length < 2 || rows[0].length < 2) return false
  if (!rows[0].every((header) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(header))) return false
  let hasLabel = false
  for (const row of rows.slice(1)) {
    if (row.length !== rows[0].length) return false
    for (const cell of row) {
      if (isOrdinaryLabel(cell)) hasLabel = true
      else if (!/^-?\d+(?:\.\d+)?$/.test(cell)) return false
    }
  }
  return hasLabel
}

// Exact reviewed cells can also be classified as facilities (e.g. 3階病棟).
// Never exempt dates/identifiers or a span crossing into unknown/free-text cells.
export function hasOnlyOrdinaryLabelPhi(
  text: string,
  spans: readonly { start: number; end: number; category: string }[]
): boolean {
  if (!isOrdinaryLabelAggregate(text)) return false
  const cells = [...text.matchAll(/[^,\r\n]+/gu)].filter((cell) => isOrdinaryLabel(cell[0]))
  return spans.every(
    (span) =>
      ((span.category === 'PERSON_NAME' || span.category === 'PHYSICIAN_NAME') &&
        text.slice(span.start, span.end) === text.trim()) ||
      (['PERSON_NAME', 'PHYSICIAN_NAME', 'FACILITY'].includes(span.category) &&
        cells.some((cell) => span.start >= cell.index && span.end <= cell.index + cell[0].length))
  )
}
