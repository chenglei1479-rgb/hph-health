import type { AiUsageStatement } from '../../../../shared/writing-safeguards/ai-usage-declaration'

// #133: a declaration may only describe executions that actually happened. The durable record of
// an execution is the Notebook run index, and `source` says who submitted it — the doctor's own
// cells are not AI usage, so they never become statements.
export type RecordedAgentRun = {
  runId: string
  sessionId: string
  kernelKind: string
  status: string
  startedAt: number
}

export type AgentRunSource = {
  sessions: {
    list: () => Promise<{ sessions: { id: string; projectId: string; updatedAt: number }[] }>
    loadOne: (request: {
      projectId: string
      sessionId: string
    }) => Promise<{ cwd: string } | undefined>
  }
  notebook: {
    runIndex: (request: { projectId: string; sessionId: string; workspaceCwd: string }) => Promise<
      readonly {
        runId: string
        source?: string
        kernelKind?: string
        status?: string
        startedAt?: number
      }[]
    >
  }
}

// Sessions are read newest first because the renderer asks the session store for every project
// session and then loads each one to learn its working directory; an old project can have many.
export const AGENT_RUN_SESSION_LIMIT = 10
export const AGENT_RUN_LIMIT = 20

export type AgentRunProjection = {
  status: 'unavailable' | 'ready'
  runs: RecordedAgentRun[]
  truncated: boolean
}

const FAILED_STATUSES = new Set([
  'failed',
  'timeout',
  'interrupted',
  'cancelled',
  'queued',
  'running'
])

// A run that did not complete produced no result for the manuscript to rest on, so it is not
// declared. The exclusion is on the recorded status, never on an assumption about the work.
export const collectRecordedAgentRuns = async (
  api: Partial<AgentRunSource> | undefined,
  projectId: string
): Promise<AgentRunProjection> => {
  if (!api?.sessions?.list || !api.sessions.loadOne || !api.notebook?.runIndex || !projectId)
    return { status: 'unavailable', runs: [], truncated: false }
  const sessions = (await api.sessions.list()).sessions
    .filter((session) => session.projectId === projectId)
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, AGENT_RUN_SESSION_LIMIT)

  const runs: RecordedAgentRun[] = []
  for (const session of sessions) {
    const loaded = await api.sessions.loadOne({ projectId, sessionId: session.id })
    if (!loaded) continue
    const index = await api.notebook.runIndex({
      projectId,
      sessionId: session.id,
      workspaceCwd: loaded.cwd
    })
    for (const run of index) {
      if (run.source !== 'agent') continue
      if (FAILED_STATUSES.has(run.status ?? '')) continue
      runs.push({
        runId: run.runId,
        sessionId: session.id,
        kernelKind: run.kernelKind ?? 'unknown',
        status: run.status ?? 'unknown',
        startedAt: run.startedAt ?? 0
      })
    }
  }

  runs.sort((left, right) => right.startedAt - left.startedAt)
  return {
    status: 'ready',
    runs: runs.slice(0, AGENT_RUN_LIMIT),
    truncated: runs.length > AGENT_RUN_LIMIT
  }
}

// The row starts from the record, not from a template: the feature names the kernel that ran and
// the purpose is the doctor's to write, because only they know what the cell was for.
export const statementsFromRuns = (runs: readonly RecordedAgentRun[]): AiUsageStatement[] =>
  runs.map((run) => ({
    feature: `Notebook (${run.kernelKind})`,
    model: '',
    purpose: '',
    evidence: { kind: 'notebook-run', runId: run.runId }
  }))
