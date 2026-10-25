const GATE_SCOPE = 'notebook:patient-row-gate'

/**
 * Diagnostics export must not carry the patient-row gate digest off the machine. The local
 * `main.log` keeps it — this runs only on the export side, one JSONL record at a time.
 *
 * The record shape is `{ level, scope, msg, data }`, so the rule is scoped by `scope` and removes
 * only `data.digest`; another record's unrelated `digest` field is left alone. A half-written line
 * (rotation or truncation) has no parseable record and is preserved byte-for-byte, so one bad line
 * never fails the whole export.
 */
const redactLine = (line: string): string => {
  if (!line.includes(GATE_SCOPE)) return line
  let record: unknown
  try {
    record = JSON.parse(line)
  } catch {
    return line
  }
  if (!record || typeof record !== 'object' || Array.isArray(record)) return line
  const entry = record as { scope?: unknown; data?: unknown }
  if (entry.scope !== GATE_SCOPE) return line
  if (!entry.data || typeof entry.data !== 'object' || Array.isArray(entry.data)) return line
  const data = entry.data as Record<string, unknown>
  if (!Object.hasOwn(data, 'digest')) return line
  const retained = { ...data }
  delete retained.digest
  return JSON.stringify({ ...entry, data: retained })
}

export const redactPatientRowGateDigest = (text: string): string =>
  text.split('\n').map(redactLine).join('\n')
