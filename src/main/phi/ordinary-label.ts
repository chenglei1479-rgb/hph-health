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
// Department/ward labels only: no spaces, digits, punctuation, personal marks or free prose.
// Admission still requires main's whole-string name guess and no other PHI category.
const WARD_OR_DEPARTMENT =
  /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー〇]+(?:病棟|科)$/u

export const isOrdinaryLabel = (text: string): boolean => {
  const value = text.trim()
  return ORDINARY_LABELS.has(value) || WARD_OR_DEPARTMENT.test(value)
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
