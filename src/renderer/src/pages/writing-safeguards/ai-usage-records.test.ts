import { describe, expect, it, vi } from 'vitest'

import {
  AGENT_RUN_LIMIT,
  collectRecordedAgentRuns,
  statementsFromRuns,
  type AgentRunSource
} from './ai-usage-records'

const run = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  runId: 'run-1',
  source: 'agent',
  kernelKind: 'python',
  status: 'completed',
  startedAt: 1,
  ...overrides
})

const api = (
  runs: readonly Record<string, unknown>[],
  sessions: readonly { id: string; updatedAt: number }[] = [{ id: 'session-1', updatedAt: 5 }]
): AgentRunSource => ({
  sessions: {
    list: vi.fn(async () => ({
      sessions: sessions.map((session) => ({ ...session, projectId: 'study-1' }))
    })),
    loadOne: vi.fn(async () => ({ cwd: '/workspace' }))
  },
  notebook: {
    runIndex: vi.fn(async () => runs as never)
  }
})

describe('AI usage records', () => {
  // #133: the doctor's own cells are not AI usage. Declaring them would misstate who did the work,
  // which is the same defect as declaring work that never happened.
  it('declares agent executions only', async () => {
    const source = api([run({ runId: 'agent-1' }), run({ runId: 'user-1', source: 'user' })])

    const projection = await collectRecordedAgentRuns(source, 'study-1')

    expect(projection.runs.map((entry) => entry.runId)).toEqual(['agent-1'])
  })

  it('skips executions that produced no result for the manuscript', async () => {
    const source = api([
      run({ runId: 'done', status: 'completed' }),
      run({ runId: 'failed', status: 'failed' }),
      run({ runId: 'running', status: 'running' }),
      run({ runId: 'cancelled', status: 'cancelled' })
    ])

    const projection = await collectRecordedAgentRuns(source, 'study-1')

    expect(projection.runs.map((entry) => entry.runId)).toEqual(['done'])
  })

  it('cites the execution on every statement it builds', async () => {
    const source = api([
      run({ runId: 'run-a', startedAt: 2 }),
      run({ runId: 'run-b', kernelKind: 'r', startedAt: 3 })
    ])

    const projection = await collectRecordedAgentRuns(source, 'study-1')

    expect(statementsFromRuns(projection.runs)).toEqual([
      {
        feature: 'Notebook (r)',
        model: '',
        purpose: '',
        evidence: { kind: 'notebook-run', runId: 'run-b' }
      },
      {
        feature: 'Notebook (python)',
        model: '',
        purpose: '',
        evidence: { kind: 'notebook-run', runId: 'run-a' }
      }
    ])
  })

  it('reports an unreadable bridge instead of pretending nothing ran', async () => {
    for (const incomplete of [
      undefined,
      {},
      { sessions: { list: vi.fn() } },
      { sessions: { list: vi.fn(), loadOne: vi.fn() } }
    ]) {
      await expect(
        collectRecordedAgentRuns(incomplete as Partial<AgentRunSource>, 'study-1')
      ).resolves.toEqual({ status: 'unavailable', runs: [], truncated: false })
    }
  })

  it('bounds the declaration and says when it did', async () => {
    const runs = Array.from({ length: AGENT_RUN_LIMIT + 3 }, (_, index) =>
      run({ runId: `run-${index}`, startedAt: index })
    )
    const projection = await collectRecordedAgentRuns(api(runs), 'study-1')

    expect(projection.runs).toHaveLength(AGENT_RUN_LIMIT)
    expect(projection.truncated).toBe(true)
    // Newest first, so the window keeps the most recent executions.
    expect(projection.runs[0]?.runId).toBe(`run-${AGENT_RUN_LIMIT + 2}`)
  })
})
