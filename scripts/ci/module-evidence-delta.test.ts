/* eslint-disable @typescript-eslint/explicit-function-return-type */

import { describe, expect, it } from 'vitest'

import {
  EVIDENCE_COLUMNS,
  assertBucketsClose,
  baselineAt,
  bucketRule,
  bucketSummary,
  columnTotals,
  computeDelta,
  formatReport,
  modulesAt,
  runDelta
} from './module-evidence-delta.mjs'

const moduleRecord = (ownerPaths, { tests = {}, interfacePaths = [] } = {}) => ({
  ownerPaths,
  interfacePaths,
  testFiles: { owner: [], consumer: [], contract: [], ...tests }
})

const baseline = (missing, count = missing.length) => ({ count, missing })

describe('tree reads', () => {
  it('assembles every module record from shards at a revision', () => {
    const modules = modulesAt('HEAD')
    // shards are read from git, so this is the same set the loader sees.
    expect(Object.keys(modules)).toContain('phi')
    expect(Object.keys(modules)).toContain('desktop_composition')
    expect(modules.phi.ownerPaths.every((path) => path.startsWith('src/main/phi/'))).toBe(true)
  })

  it('reads the baseline at a revision, not from the worktree', () => {
    const atHead = baselineAt('HEAD')
    expect(Array.isArray(atHead.missing)).toBe(true)
    expect(typeof atHead.count).toBe('number')
  })
})

describe('five-column delta', () => {
  it('counts every column and keeps interfacePaths out of the evidence sum', () => {
    const baseModules = {
      a: moduleRecord(['src/a/x.ts'], { tests: { owner: ['src/a/x.test.ts'] } })
    }
    const headModules = {
      a: moduleRecord(['src/a/x.ts', 'src/a/y.ts'], {
        tests: { owner: ['src/a/x.test.ts', 'src/a/y.test.ts'], consumer: ['src/b/z.test.ts'] },
        interfacePaths: ['src/shared/z.ts']
      })
    }
    const delta = computeDelta({
      baseModules,
      headModules,
      baseBaseline: baseline(['src/a/y.ts'], 1),
      headBaseline: baseline([], 0)
    })

    expect(delta.columns.ownerPaths.delta).toBe(1)
    expect(delta.columns.owner.delta).toBe(1)
    expect(delta.columns.consumer.delta).toBe(1)
    expect(delta.columns.contract.delta).toBe(0)
    expect(delta.columns.interfacePaths.delta).toBe(1)
    // ownerPaths 1 + owner 1 + consumer 1 + contract 0; interfacePaths is reported, not summed.
    expect(delta.evidence).toBe(3)
    expect(delta.paid).toBe(1)
    expect(delta.verdict).toBe('NOT-A-PAYMENT-BATCH')
    expect(delta.reasons.join(' ')).toContain('interfacePaths +1')
  })

  it('passes a payment batch whose evidence covers every paid entry', () => {
    const headModules = {
      a: moduleRecord(['src/a/x.ts'], { tests: { owner: ['src/a/x.test.ts'] } })
    }
    const delta = computeDelta({
      baseModules: { a: moduleRecord([], {}) },
      headModules,
      baseBaseline: baseline(['src/a/x.ts', 'src/a/y.ts'], 2),
      headBaseline: baseline([], 0)
    })
    expect(delta.evidence).toBe(2)
    expect(delta.paid).toBe(2)
    expect(delta.verdict).toBe('PASS')
  })

  it('reports a source-only range as a pass with no debt change', () => {
    const same = { a: moduleRecord(['src/a/x.ts']) }
    const delta = computeDelta({
      baseModules: same,
      headModules: same,
      baseBaseline: baseline(['src/b/z.ts'], 1),
      headBaseline: baseline(['src/b/z.ts'], 1)
    })
    expect(delta.evidence).toBe(0)
    expect(delta.paid).toBe(0)
    expect(delta.verdict).toBe('PASS (no debt change)')
  })
})

describe('failure direction', () => {
  it('fails when the evidence is smaller than the entries paid', () => {
    const delta = computeDelta({
      baseModules: { a: moduleRecord([]) },
      // one ownerPaths line for two entries paid: evidence 1 < paid 2
      headModules: { a: moduleRecord(['src/a/x.ts']) },
      baseBaseline: baseline(['src/a/x.ts', 'src/a/y.ts'], 2),
      headBaseline: baseline([], 0)
    })
    expect(delta.evidence).toBe(1)
    expect(delta.paid).toBe(2)
    expect(delta.verdict).toBe('FAIL')
    expect(delta.reasons).toContain('evidence 1 < paid 2')
  })

  it('fails when the baseline gained entries', () => {
    const delta = computeDelta({
      baseModules: { a: moduleRecord(['src/a/x.ts']) },
      headModules: { a: moduleRecord(['src/a/x.ts']) },
      baseBaseline: baseline(['src/a/old.ts'], 1),
      headBaseline: baseline(['src/a/old.ts', 'src/a/new.ts'], 2)
    })
    expect(delta.baseline.added).toBe(1)
    expect(delta.baseline.removed).toBe(-1)
    expect(delta.verdict).toBe('FAIL')
    expect(delta.reasons).toContain('baseline added 1')
  })

  it('reports MISSING instead of reading an absent key as zero', () => {
    const delta = computeDelta({
      baseModules: { a: moduleRecord(['src/a/x.ts']) },
      headModules: {
        // no testFiles at all: a batch that only touched ownerPaths must not look like owner +0
        a: { ownerPaths: ['src/a/x.ts'], interfacePaths: [] }
      },
      baseBaseline: baseline([], 0),
      headBaseline: baseline([], 0)
    })
    expect(delta.missing).toContain('a.testFiles')
    expect(delta.verdict).toBe('INCOMPLETE')
    expect(formatReport(delta, { base: 'x', head: 'y' })).toContain('MISSING a.testFiles')
  })

  it('exposes the missing keys from columnTotals rather than dropping them', () => {
    const { totals, missing } = columnTotals({ a: { ownerPaths: [], interfacePaths: [] } })
    expect(missing).toEqual(['a.testFiles'])
    expect(totals.owner).toBe(0)
  })
})

describe('buckets', () => {
  const modules = {
    single: moduleRecord(['src/x/one.ts']),
    first: moduleRecord(['src/shared/a.ts']),
    second: moduleRecord(['src/shared/b.ts'])
  }

  it('buckets by the number of modules owning a sibling in the entry directory', () => {
    const buckets = bucketSummary(modules, ['src/x/two.ts', 'src/shared/c.ts', 'src/nowhere.ts'])
    expect(buckets).toEqual({ none: 1, one: 1, many: 1, total: 3 })
    expect(bucketRule()).toContain('0 -> none, 1 -> one, >=2 -> many')
  })

  it('refuses a table whose buckets do not add up to the baseline count', () => {
    const buckets = bucketSummary(modules, ['src/x/two.ts'])
    expect(() => assertBucketsClose('head', buckets, 2)).toThrow(
      /head buckets do not close: none 0 \+ one 1 \+ many 0 = 1, baseline count 2/
    )
    expect(assertBucketsClose('head', buckets, 1)).toEqual(buckets)
  })

  it('prints the rule with the table', () => {
    const delta = computeDelta({
      baseModules: modules,
      headModules: modules,
      baseBaseline: baseline(['src/x/two.ts'], 1),
      headBaseline: baseline(['src/x/two.ts'], 1)
    })
    const report = formatReport(delta, { base: 'a', head: 'b' })
    expect(report).toContain('0 -> none, 1 -> one, >=2 -> many')
    expect(report).toContain('total    1 -> 1')
  })
})

describe('runDelta against git', () => {
  it('reads both sides from revisions and closes the buckets', () => {
    const delta = runDelta({ base: 'HEAD', head: 'HEAD' })
    expect(delta.verdict).toBe('PASS (no debt change)')
    expect(delta.buckets.base.total).toBe(delta.buckets.head.total)
    expect(EVIDENCE_COLUMNS).toEqual(['ownerPaths', 'owner', 'consumer', 'contract'])
  })

  it('rejects a missing revision instead of pretending it is empty', () => {
    expect(() => runDelta({ base: 'HEAD', head: 'refs/heads/does-not-exist' })).toThrow(
      /no scripts\/ci\/module-impact.json at/
    )
  })
})
