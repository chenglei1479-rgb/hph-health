import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ info: vi.fn() }))

// Only the gate logger is captured; every other scope keeps the real file logger.
vi.mock('@aipoch/diagnostics/node', async (original) => {
  const actual = await original<typeof import('@aipoch/diagnostics/node')>()
  return {
    ...actual,
    createLogger: (scope: string) =>
      scope === 'notebook:patient-row-gate'
        ? { ...actual.createLogger(scope), info: mocks.info }
        : actual.createLogger(scope)
  }
})

vi.mock('../../phi/gate', async (original) => ({
  ...(await original<typeof import('../../phi/gate')>()),
  assertModelBoundTextReleased: async (text: string) => text
}))

const { installNotebookModelTextReleaser, releaseNotebookModelText } = await import(
  './release-model-text'
)
const { PATIENT_ROW_BLOCK_MESSAGE } = await import('./patient-row-output')

const multiKeyAggregate = [
  'site,sex,age_band,period,ward,mean,n',
  'A,男性,40s,2020,W1,55.2,12',
  'B,女性,50s,2021,W2,60.1,15'
].join('\n')

beforeEach(() => {
  mocks.info.mockReset()
})

afterEach(() => {
  installNotebookModelTextReleaser(null)
})

describe('patient-row gate log', () => {
  it('logs the branch and shape metrics when it blocks an output', async () => {
    await expect(releaseNotebookModelText(multiKeyAggregate, 'project-1')).resolves.toBe(
      PATIENT_ROW_BLOCK_MESSAGE
    )

    expect(mocks.info).toHaveBeenCalledOnce()
    const [message, fields] = mocks.info.mock.calls[0]
    expect(message).toBe('blocked notebook output attributed to patient rows')
    expect(fields).toMatchObject({
      block: 'non-aggregate-table',
      tables: 1,
      describeTables: 0,
      textLength: multiKeyAggregate.length
    })
    expect(fields.tableShapes[0]).toEqual({
      rows: 2,
      columns: 7,
      statHeaders: 2,
      groupKeys: 5,
      describe: false
    })
  })

  it('never writes output text, cells, or variable names to the log', async () => {
    await releaseNotebookModelText(multiKeyAggregate, 'project-1')

    const payload = JSON.stringify(mocks.info.mock.calls[0])
    const fragments = ['site', 'sex', 'age_band', 'ward', '男性', '女性', 'W1', '55.2']
    for (const fragment of fragments) expect(payload).not.toContain(fragment)
  })

  it('logs nothing when the aggregate is released', async () => {
    installNotebookModelTextReleaser(async (text) => text)

    await expect(releaseNotebookModelText('sex,n\n男性,20\n女性,30', 'project-1')).resolves.toBe(
      'sex,n\n男性,20\n女性,30'
    )

    expect(mocks.info).not.toHaveBeenCalled()
  })
})
