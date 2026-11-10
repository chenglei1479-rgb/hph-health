/* eslint-disable @typescript-eslint/explicit-function-return-type */

// Accounts one ownership batch from git objects: the five manifest columns, the baseline movement,
// and the debt buckets on both sides. Written because manual accounting of #218 batches was wrong
// three times (a missed testFiles.owner count, three missed shared files, one mis-bucketed entry).
//
// Both sides are read from git revisions (`--base` / `--head`), never from the worktree, so a
// reviewer can reproduce the numbers for a merged commit without checking anything out. The
// baseline's `count` field is reported but not trusted for `paid`: paid is
// `base missing.length - head missing.length`.
//
// Verdicts:
//   PASS                      evidence >= paid, no baseline additions, no interface growth
//   PASS (no debt change)      all zeros - e.g. a source-only or download-only batch
//   NOT-A-PAYMENT-BATCH        evidence >= paid but interfacePaths grew; honest, not a failure
//   FAIL ...                   evidence < paid, or the baseline gained entries
//   INCOMPLETE ...             a key is absent, so a column cannot be totalled (never read as 0)

import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

export const EVIDENCE_COLUMNS = ['ownerPaths', 'owner', 'consumer', 'contract']
export const REPORTED_COLUMNS = [...EVIDENCE_COLUMNS, 'interfacePaths']

const shardPattern = /^scripts\/ci\/module-impact\/([a-z][a-z0-9_]*)\.json$/
const REGISTRATION = 'scripts/ci/module-impact.json'
const BASELINE = 'scripts/ci/module-ownership.baseline.json'

function gitShow(rev, path) {
  try {
    return execFileSync('git', ['show', `${rev}:${path}`], { encoding: 'utf8', stdio: 'pipe' })
  } catch {
    return undefined
  }
}

function shardPaths(rev) {
  let listing
  try {
    listing = execFileSync(
      'git',
      ['ls-tree', '-r', '--name-only', rev, 'scripts/ci/module-impact/'],
      {
        encoding: 'utf8',
        stdio: 'pipe'
      }
    )
  } catch {
    return []
  }
  return listing
    .split('\n')
    .filter((path) => shardPattern.test(path))
    .sort()
}

/**
 * Reads many paths at one revision with a single `git cat-file --batch` instead of one `git show`
 * per shard: 260 spawns cost ~28s on Windows, which made the command too slow to run per batch.
 */
export function readRevision(rev) {
  const paths = [REGISTRATION, BASELINE, ...shardPaths(rev)]
  const input = paths.map((path) => `${rev}:${path}`).join('\n') + '\n'
  let out
  try {
    out = execFileSync('git', ['cat-file', '--batch'], {
      input,
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 128 * 1024 * 1024
    })
  } catch {
    return new Map()
  }
  const buffer = Buffer.isBuffer(out) ? out : Buffer.from(out)
  const contents = new Map()
  let offset = 0
  for (const path of paths) {
    const newline = buffer.indexOf(10, offset)
    if (newline === -1) break
    const header = buffer.subarray(offset, newline).toString('utf8')
    const parts = header.split(' ')
    if (parts.length < 3) {
      offset = newline + 1
      continue
    }
    const size = Number(parts[2])
    const start = newline + 1
    contents.set(path, buffer.subarray(start, start + size).toString('utf8'))
    offset = start + size + 1
  }
  return contents
}

/** Every module record at `rev`, assembled the same way the loader does it. */
export function modulesAt(rev, { read, paths } = {}) {
  const shards = paths ?? shardPaths(rev)
  // one batch read for the whole revision; a per-path reader is only for tests
  const contents = read ? undefined : readRevision(rev)
  const load = read ? (path) => read(path, rev) : (path) => contents.get(path)
  const registration = load(REGISTRATION)
  if (registration === undefined) throw new Error(`no ${REGISTRATION} at ${rev}`)
  const root = JSON.parse(registration)
  const modules = { ...(root.modules ?? {}) }
  for (const path of shards) {
    const text = load(path)
    if (text === undefined) continue
    const id = shardPattern.exec(path)[1]
    modules[id] = JSON.parse(text)
  }
  if (Object.keys(modules).length === 0) throw new Error(`no modules at ${rev}`)
  return modules
}

/** The ownership baseline at `rev`. */
export function baselineAt(rev, { read } = {}) {
  const text = read ? read(BASELINE, rev) : readRevision(rev).get(BASELINE)
  if (text === undefined) throw new Error(`no ${BASELINE} at ${rev}`)
  return JSON.parse(text)
}

/**
 * Totals one side. A missing key produces a MISSING entry instead of a silent zero, so a batch that
 * only touches `testFiles.owner` can never be reported as if the other columns were zero.
 */
export function columnTotals(modules) {
  const totals = { ownerPaths: 0, owner: 0, consumer: 0, contract: 0, interfacePaths: 0 }
  const missing = []
  for (const [id, module] of Object.entries(modules)) {
    if (!Array.isArray(module.ownerPaths)) missing.push(`${id}.ownerPaths`)
    else totals.ownerPaths += module.ownerPaths.length
    if (!Array.isArray(module.interfacePaths)) missing.push(`${id}.interfacePaths`)
    else totals.interfacePaths += module.interfacePaths.length
    if (!module.testFiles || typeof module.testFiles !== 'object') {
      missing.push(`${id}.testFiles`)
      continue
    }
    for (const kind of ['owner', 'consumer', 'contract']) {
      if (!Array.isArray(module.testFiles[kind])) missing.push(`${id}.testFiles.${kind}`)
      else totals[kind] += module.testFiles[kind].length
    }
  }
  return { totals, missing }
}

/**
 * For every unowned entry, how many modules own a sibling file directly in that entry's directory.
 * 0 -> none, 1 -> one, >=2 -> many. The rule is printed with the table so a reader can re-derive it.
 */
export function bucketSummary(modules, missingPaths) {
  const dirsByModule = new Map()
  for (const [id, module] of Object.entries(modules)) {
    const dirs = new Set()
    for (const path of module.ownerPaths ?? []) dirs.add(path.split('/').slice(0, -1).join('/'))
    dirsByModule.set(id, dirs)
  }
  const buckets = { none: 0, one: 0, many: 0 }
  for (const path of missingPaths) {
    const dir = path.split('/').slice(0, -1).join('/')
    let count = 0
    for (const dirs of dirsByModule.values()) if (dirs.has(dir)) count += 1
    if (count === 0) buckets.none += 1
    else if (count === 1) buckets.one += 1
    else buckets.many += 1
  }
  return { ...buckets, total: buckets.none + buckets.one + buckets.many }
}

export function bucketRule() {
  return (
    'buckets by modules that own a sibling file directly in the entry directory: ' +
    '0 -> none, 1 -> one, >=2 -> many'
  )
}

/** Buckets must close on the baseline count; a mismatch is a defect, not a table to print. */
export function assertBucketsClose(side, buckets, count) {
  if (buckets.total !== count) {
    throw new Error(
      `${side} buckets do not close: none ${buckets.none} + one ${buckets.one} + many ${buckets.many} = ${buckets.total}, baseline count ${count}`
    )
  }
  return buckets
}

export function computeDelta({ baseModules, headModules, baseBaseline, headBaseline }) {
  const base = columnTotals(baseModules)
  const head = columnTotals(headModules)
  const missing = [...new Set([...base.missing, ...head.missing])].sort()

  const columns = {}
  for (const key of REPORTED_COLUMNS) {
    columns[key] = {
      base: base.totals[key],
      head: head.totals[key],
      delta: head.totals[key] - base.totals[key]
    }
  }

  const baseMissing = baseBaseline.missing ?? []
  const headMissing = headBaseline.missing ?? []
  const baseline = {
    removed: baseMissing.length - headMissing.length,
    added: headMissing.filter((path) => !baseMissing.includes(path)).length,
    countBase: baseBaseline.count,
    countHead: headBaseline.count
  }

  const evidence = EVIDENCE_COLUMNS.reduce((sum, key) => sum + columns[key].delta, 0)
  const paid = baseline.removed

  const baseBuckets = bucketSummary(baseModules, baseMissing)
  const headBuckets = bucketSummary(headModules, headMissing)

  let verdict
  const reasons = []
  if (missing.length > 0) {
    verdict = 'INCOMPLETE'
    reasons.push(`MISSING ${missing.join(', ')}`)
  } else if (baseline.added > 0) {
    verdict = 'FAIL'
    reasons.push(`baseline added ${baseline.added}`)
  } else if (evidence < paid) {
    verdict = 'FAIL'
    reasons.push(`evidence ${evidence} < paid ${paid}`)
  } else if (columns.interfacePaths.delta !== 0) {
    verdict = 'NOT-A-PAYMENT-BATCH'
    reasons.push(
      `interfacePaths ${columns.interfacePaths.delta > 0 ? '+' : ''}${columns.interfacePaths.delta}`
    )
  } else if (evidence === 0 && paid === 0 && baseline.added === 0) {
    verdict = 'PASS (no debt change)'
  } else {
    verdict = 'PASS'
  }

  return {
    columns,
    baseline,
    evidence,
    paid,
    missing,
    verdict,
    reasons,
    buckets: { base: baseBuckets, head: headBuckets },
    baseMissing,
    headMissing
  }
}

const signed = (value) => `${value >= 0 ? '+' : ''}${value}`

export function formatReport(delta, { base, head } = {}) {
  const lines = []
  lines.push(`Ownership evidence delta ${base}..${head}`)
  lines.push('')
  lines.push(
    `ownerPaths ${signed(delta.columns.ownerPaths.delta)} | testFiles.owner ${signed(delta.columns.owner.delta)} | consumer ${signed(delta.columns.consumer.delta)} | contract ${signed(delta.columns.contract.delta)} | interfacePaths ${signed(delta.columns.interfacePaths.delta)}`
  )
  lines.push(
    `baseline removed ${-delta.baseline.removed} | added ${signed(delta.baseline.added)} | count ${delta.baseline.countBase} -> ${delta.baseline.countHead}`
  )
  lines.push(
    `evidence = ${delta.evidence} (ownerPaths ${delta.columns.ownerPaths.delta} + owner ${delta.columns.owner.delta} + consumer ${delta.columns.consumer.delta} + contract ${delta.columns.contract.delta})`
  )
  lines.push(`paid = ${delta.paid}`)
  lines.push(
    `verdict: ${delta.verdict}${delta.reasons.length ? ` (${delta.reasons.join('; ')})` : ''}`
  )
  lines.push('')
  lines.push(bucketRule())
  const { base: b, head: h } = delta.buckets
  lines.push(`${'none'.padEnd(5)} ${String(b.none).padStart(4)} -> ${h.none}`)
  lines.push(`${'one'.padEnd(5)} ${String(b.one).padStart(4)} -> ${h.one}`)
  lines.push(`${'many'.padEnd(5)} ${String(b.many).padStart(4)} -> ${h.many}`)
  lines.push(`${'total'.padEnd(5)} ${String(b.total).padStart(4)} -> ${h.total}`)
  return lines.join('\n')
}

function argumentValue(args, flag) {
  const index = args.indexOf(flag)
  return index === -1 ? undefined : args[index + 1]
}

export function runDelta({ base, head, read } = {}) {
  if (!base || !head) throw new Error('--base and --head are required')
  const baseModules = modulesAt(base, { read })
  const headModules = modulesAt(head, { read })
  const baseBaseline = baselineAt(base, { read })
  const headBaseline = baselineAt(head, { read })
  const delta = computeDelta({ baseModules, headModules, baseBaseline, headBaseline })
  assertBucketsClose('base', delta.buckets.base, baseBaseline.count ?? delta.baseMissing.length)
  assertBucketsClose('head', delta.buckets.head, headBaseline.count ?? delta.headMissing.length)
  return delta
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const base = argumentValue(args, '--base')
  const head = argumentValue(args, '--head')
  try {
    const delta = runDelta({ base, head })
    if (args.includes('--json')) console.log(JSON.stringify(delta, null, 2))
    else console.log(formatReport(delta, { base, head }))
    if (delta.verdict.startsWith('FAIL') || delta.verdict === 'INCOMPLETE') process.exitCode = 1
  } catch (error) {
    console.error(`module-evidence-delta: ${error instanceof Error ? error.message : error}`)
    process.exitCode = 1
  }
}
