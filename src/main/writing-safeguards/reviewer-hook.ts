import { MAX_REVIEW_CHECKS } from '../reviewer/submission-limits'
import type { NewCheck } from '../../shared/reviewer'
import {
  conclusionCheckEnabled,
  flagConclusions,
  type ConclusionFlag
} from '../../shared/writing-safeguards/conclusion-check'

export const CONCLUSION_FLAG_PREFIX = 'conclusion-check:'

export const isConclusionFlagCheck = (check: { evidence: string }): boolean =>
  check.evidence.startsWith(CONCLUSION_FLAG_PREFIX)

type ReviewBlock = {
  kind: string
  payload: Record<string, unknown>
}

const collectStrings = (value: unknown, out: string[]): void => {
  if (typeof value === 'string') {
    out.push(value)
    return
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectStrings(entry, out))
    return
  }
  if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((entry) => collectStrings(entry, out))
  }
}

const textOf = (payload: Record<string, unknown>, keys: string[]): string =>
  keys
    .map((key) => payload[key])
    .filter((value): value is string => typeof value === 'string')
    .join('\n')

const sectionAfter = (text: string, heading: RegExp): string | undefined => {
  const lines = text.split(/\n/)
  const start = lines.findIndex((line) => heading.test(line.trim()))
  if (start < 0) return undefined
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((line) => /^#{1,3}\s+\S/.test(line.trim()))
  const body = (end >= 0 ? rest.slice(0, end) : rest).join('\n').trim()
  return body.length > 0 ? body : undefined
}

const conclusionText = (manuscript: string): string => {
  const headed = sectionAfter(manuscript, /^(?:#{0,3}\s*)?(?:結論|結語|Conclusions?)$/i)
  if (headed) return headed
  return manuscript
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => /したがって|以上より|in conclusion|we conclude/i.test(line))
    .join('\n')
}

const limitationsText = (notebook: string): string => {
  const headed = sectionAfter(notebook, /^(?:#{0,3}\s*)?(?:限界|研究の限界|Limitations?)$/i)
  if (headed) return headed
  return notebook
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => /限界|limitation|一般化|対象は|単一施設|因果/i.test(line))
    .join('\n')
}

const NOTEBOOK_SIGNAL = /p\s*[=<>＜＞＝]|相関|有意|limitation|限界|対象は|平均|mean/i

export const conclusionFlagsFromBlocks = (
  blocks: readonly ReviewBlock[],
  env: Record<string, string | undefined> = process.env
): ConclusionFlag[] => {
  if (!conclusionCheckEnabled(env)) return []
  const manuscript: string[] = []
  const notebook: string[] = []
  for (const block of blocks) {
    if (block.kind === 'message') {
      const content = textOf(block.payload, ['content'])
      if (content) manuscript.push(content)
      continue
    }
    const output = textOf(block.payload, ['terminalOutput', 'rawOutput', 'stdout', 'content'])
    if (output) notebook.push(output)
  }
  const notebookText = notebook.join('\n')
  if (!NOTEBOOK_SIGNAL.test(notebookText)) return []
  const limitations = limitationsText(notebookText)
  const checked = flagConclusions({
    conclusions: conclusionText(manuscript.join('\n')),
    notebook: { results: notebookText, limitations },
    enabled: true
  })
  return checked.flags
}

export const appendConclusionFlags = (
  checks: readonly NewCheck[],
  blocks: readonly ReviewBlock[],
  env: Record<string, string | undefined> = process.env
): NewCheck[] => {
  const room = MAX_REVIEW_CHECKS - checks.length
  if (room <= 0) return [...checks]
  const flags = conclusionFlagsFromBlocks(blocks, env).slice(0, room)
  if (flags.length === 0) return [...checks]
  const added: NewCheck[] = flags.map((flag, index) => ({
    status: 'warn',
    claim: flag.sentence.slice(0, 500),
    evidence: `${CONCLUSION_FLAG_PREFIX}${flag.kind} ${flag.evidence}`,
    sortIndex: checks.length + index
  }))
  return [...checks, ...added]
}
