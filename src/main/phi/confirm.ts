import type { NativeTranslator } from '../locale/main-process-messages'
import type { PhiCategory } from './detect'
import type { PhiReplacement } from './deidentify'

export interface PhiHighlight {
  start: number
  end: number
  category: PhiCategory | 'MANUAL'
}

export interface PhiPreview {
  text: string
  highlights: PhiHighlight[]
}

export interface PhiSpanMark {
  start: number
  end: number
}

export interface PhiConfirmDecision {
  confirmed: boolean
  extraSpans?: readonly PhiSpanMark[]
}

export type PhiConfirmer = (
  preview: PhiPreview,
  signal?: AbortSignal
) => Promise<PhiConfirmDecision>

export interface PhiConfirmLabels {
  title: string
  explanation: string
  confirm: string
  cancel: string
  mark: string
}

export function phiConfirmLabels(translate: NativeTranslator): PhiConfirmLabels {
  return {
    title: translate('Review de-identified text'),
    explanation: translate(
      'Highlighted text was replaced before sending. Select any other patient information and mark it. Confirm to send. Closing this window sends nothing.'
    ),
    confirm: translate('Confirm send'),
    cancel: translate('Cancel'),
    mark: translate('Mark selection')
  }
}

const CONFIRM_PREFIX = 'PHI_CONFIRM '

export function previewFromResult(original: string, replacements: PhiReplacement[]): PhiPreview {
  const ordered = [...replacements].sort((a, b) => b.start - a.start)
  let text = original
  const highlights: PhiHighlight[] = []
  for (const item of ordered) {
    text = text.slice(0, item.start) + item.replacement + text.slice(item.end)
    highlights.push({
      start: item.start,
      end: item.start + item.replacement.length,
      category: item.category
    })
  }
  highlights.sort((a, b) => a.start - b.start)
  return { text, highlights }
}

export function highlightTokens(
  text: string,
  tokens: ReadonlyArray<{ replacement: string; category: PhiCategory }>
): PhiHighlight[] {
  const used: Array<{ start: number; end: number }> = []
  const highlights: PhiHighlight[] = []
  for (const token of tokens) {
    if (!token.replacement) continue
    let from = 0
    while (from <= text.length) {
      const index = text.indexOf(token.replacement, from)
      if (index < 0) break
      const end = index + token.replacement.length
      const clash = used.some((item) => index < item.end && item.start < end)
      if (!clash) {
        used.push({ start: index, end })
        highlights.push({ start: index, end, category: token.category })
      }
      from = end
    }
  }
  highlights.sort((a, b) => a.start - b.start)
  return highlights
}

export function applyManualSpans(
  text: string,
  spans: readonly PhiSpanMark[],
  placeholder: (original: string) => string
): string {
  const ordered = [...spans].sort((a, b) => a.start - b.start)
  let cursor = 0
  for (const span of ordered) {
    if (
      !Number.isInteger(span.start) ||
      !Number.isInteger(span.end) ||
      span.start < cursor ||
      span.end > text.length ||
      span.end <= span.start
    ) {
      throw new Error('A marked span is outside the de-identified text. The request was not sent.')
    }
    cursor = span.end
  }
  let next = text
  for (const span of [...ordered].reverse()) {
    next =
      next.slice(0, span.start) +
      placeholder(text.slice(span.start, span.end)) +
      next.slice(span.end)
  }
  return next
}

export function parseConfirmDecision(message: string): PhiConfirmDecision | null {
  if (!message.startsWith(CONFIRM_PREFIX)) return null
  const parsed: unknown = JSON.parse(message.slice(CONFIRM_PREFIX.length))
  if (!parsed || typeof parsed !== 'object') return null
  const record = parsed as { confirmed?: unknown; extraSpans?: unknown }
  const extraSpans = Array.isArray(record.extraSpans)
    ? record.extraSpans.filter(isSpanMark)
    : undefined
  return { confirmed: record.confirmed === true, ...(extraSpans ? { extraSpans } : {}) }
}

function isSpanMark(value: unknown): value is PhiSpanMark {
  if (!value || typeof value !== 'object') return false
  const span = value as { start?: unknown; end?: unknown }
  return typeof span.start === 'number' && typeof span.end === 'number'
}

// Installs the review page into an already-loaded blank document. The payload is JSON so the
// de-identified text cannot break out of the script.
export function buildConfirmInstaller(preview: PhiPreview, labels: PhiConfirmLabels): string {
  const payload = JSON.stringify({
    text: preview.text,
    highlights: preview.highlights,
    labels,
    prefix: CONFIRM_PREFIX
  }).replace(/</g, '\\u003c')
  return `(() => {
    const payload = ${payload}
    const extras = []
    const style = document.createElement('style')
    style.textContent = 'body{margin:0;font:14px/1.5 sans-serif;color:#1c1917;background:#fafaf9}header,footer{padding:12px 16px}header p{margin:8px 0 0;color:#44403c}pre{margin:0;padding:16px;white-space:pre-wrap;word-break:break-word;min-height:240px}mark{background:#fde68a;border-radius:2px}.extra{background:#fecaca}footer{display:flex;gap:8px;justify-content:flex-end;border-top:1px solid #e7e5e4}button{font:inherit;padding:6px 12px}'
    document.head.replaceChildren(style)
    document.title = payload.labels.title
    const header = document.createElement('header')
    const heading = document.createElement('strong')
    heading.textContent = payload.labels.title
    const explanation = document.createElement('p')
    explanation.textContent = payload.labels.explanation
    header.append(heading, explanation)
    const pre = document.createElement('pre')
    pre.id = 'preview'
    const footer = document.createElement('footer')
    const mark = document.createElement('button')
    mark.type = 'button'
    mark.id = 'mark'
    mark.textContent = payload.labels.mark
    const cancel = document.createElement('button')
    cancel.type = 'button'
    cancel.id = 'cancel'
    cancel.textContent = payload.labels.cancel
    const confirm = document.createElement('button')
    confirm.type = 'button'
    confirm.id = 'confirm'
    confirm.textContent = payload.labels.confirm
    footer.append(mark, cancel, confirm)
    document.body.replaceChildren(header, pre, footer)
    const ranges = () => [...payload.highlights.map((item) => ({ ...item, kind: 'phi' })), ...extras.map((item) => ({ ...item, kind: 'extra', category: 'MANUAL' }))].sort((a, b) => a.start - b.start || a.end - b.end)
    const render = () => {
      pre.replaceChildren()
      let cursor = 0
      for (const range of ranges()) {
        if (range.start < cursor || range.end > payload.text.length || range.end <= range.start) continue
        if (range.start > cursor) pre.append(payload.text.slice(cursor, range.start))
        const markNode = document.createElement('mark')
        if (range.kind === 'extra') markNode.className = 'extra'
        markNode.dataset.start = String(range.start)
        markNode.textContent = payload.text.slice(range.start, range.end)
        pre.append(markNode)
        cursor = range.end
      }
      if (cursor < payload.text.length) pre.append(payload.text.slice(cursor))
    }
    const offsetOf = (node, offset) => {
      const host = node.nodeType === Node.TEXT_NODE ? node.parentElement : node
      if (!host || !pre.contains(host)) return null
      const start = host.dataset && host.dataset.start ? Number(host.dataset.start) : null
      if (start == null || Number.isNaN(start)) {
        let index = 0
        for (const child of pre.childNodes) {
          if (child === node || child === host) return index + offset
          index += child.textContent ? child.textContent.length : 0
        }
        return null
      }
      return start + offset
    }
    mark.addEventListener('click', () => {
      const selection = document.getSelection()
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return
      const range = selection.getRangeAt(0)
      const start = offsetOf(range.startContainer, range.startOffset)
      const end = offsetOf(range.endContainer, range.endOffset)
      if (start == null || end == null || end <= start) return
      extras.push({ start, end })
      selection.removeAllRanges()
      render()
    })
    const report = (confirmed) => console.log(payload.prefix + JSON.stringify({ confirmed, extraSpans: extras }))
    confirm.addEventListener('click', () => report(true))
    cancel.addEventListener('click', () => report(false))
    render()
  })()`
}
