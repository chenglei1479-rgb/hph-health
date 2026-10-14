type Rule = {
  pattern: RegExp
  group: number
}

const RULES: Rule[] = [
  { pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, group: 0 },
  { pattern: /(?:\+81[-\s]?)?0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}/g, group: 0 },
  {
    pattern: /(?:マイナンバー|個人番号|My Number)\s*[:：]?\s*(\d{4}(?:[-\s]\d{4}){2}|\d{12})/g,
    group: 1
  },
  { pattern: /(?:カルテ番号|患者番号|患者ID)\s*[:：]?\s*([0-9A-Za-z-]{4,})/g, group: 1 },
  { pattern: /(?:保険者番号)\s*[:：]?\s*(\d{6,8})/g, group: 1 },
  { pattern: /(?:被保険者証記号|被保険者番号)\s*[:：]?\s*([0-9A-Za-z-]{4,})/g, group: 1 },
  { pattern: /(?:患者氏名|患者名|氏名)\s*[:：]?\s*[^\s、,。"'「」[\]{}]{1,40}/g, group: 0 },
  { pattern: /(?:生年月日|誕生日)\s*[:：]?\s*(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?)/g, group: 1 }
]

const spans = (text: string): Array<{ start: number; end: number }> => {
  const found: Array<{ start: number; end: number }> = []
  for (const rule of RULES) {
    rule.pattern.lastIndex = 0
    for (const match of text.matchAll(rule.pattern)) {
      const value = match[rule.group]
      if (!value) continue
      const start = match.index + match[0].lastIndexOf(value)
      found.push({ start, end: start + value.length })
    }
  }
  return found.sort((left, right) => right.start - left.start)
}

/** Mark left in place of patient text. Japanese UI calls this 仮名化済み, never 匿名化. */
export const PSEUDONYMIZED_MARK = '[仮名化済み]'

export const redactPatientPhi = (text: string): string => {
  let next = text
  for (const span of spans(text)) {
    next = `${next.slice(0, span.start)}${PSEUDONYMIZED_MARK}${next.slice(span.end)}`
  }
  return next
}
