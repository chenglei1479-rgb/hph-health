// #160: the review window must only ask about text the doctor wrote. `instructions` is the agent prompt
// the CLI composes (our base instructions, the registered Skill catalog, project AGENTS.md), and the
// physician-name rule used to read English prose inside it as a name ("API route definitions" matched the
// `PI` inside `API`), so a clean project's literature request opened a review window full of our own
// prompt. The release scan still rewrites that text; it is just not review work.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { loggerInfo } = vi.hoisted(() => ({ loggerInfo: vi.fn() }))

// The notice below is the only compensation for releasing prompt text without review: it is what support
// has when a doctor never sees a window. It must be asserted, and the assertion must also hold its
// PHI-adjacent invariant - the replaced text itself may never reach the log.
vi.mock('@aipoch/diagnostics/node', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@aipoch/diagnostics/node')>()),
  createLogger: () => ({
    debug: vi.fn(),
    info: loggerInfo,
    warn: vi.fn(),
    error: vi.fn()
  })
}))

// `test/setup-phi.ts` installs the gate before this file runs, so `gate.ts` - and the module-scoped
// `createLogger('phi')` const inside it - is already evaluated against the real diagnostics factory by
// the time these mocks register. Import the graph again after resetting the registry so the logger above
// is the one the gate actually uses; otherwise the call is unobservable and the assertion below can only
// ever pass by accident. Each test gets its own graph, which also removes the need to uninstall state.
const loadPhi = async () => {
  vi.resetModules()
  const gate = await import('./gate')
  const { createMemoryPhiVault } = await import('./store')
  const { fetchProviderRequest } = await import('../settings/provider-fetch')
  return { gate, createMemoryPhiVault, fetchProviderRequest }
}

const body = (instructions: string, input: string): string =>
  JSON.stringify({
    model: 'gpt-5',
    instructions,
    input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: input }] }]
  })

const literatureQuery = 'PubMedで「再入院」を検索し、J-STAGEで「再入院」を検索してください。'

describe('review scope for application-owned prompt text', () => {
  beforeEach(() => {
    loggerInfo.mockClear()
  })

  it('sends without review when only the application prompt was rewritten', async () => {
    const { gate, createMemoryPhiVault, fetchProviderRequest } = await loadPhi()
    gate.installMachineApproval(null)
    gate.installPhiGate(gate.createVaultBackedGate(createMemoryPhiVault()))
    const confirm = vi.fn(async () => ({ confirmed: true, extraSpans: [] }))
    gate.installPhiConfirmer(confirm)
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('{}'))
    await fetchProviderRequest(fetchImpl, 'https://gateway.invalid/v1/responses', {
      method: 'POST',
      body: body('保険者番号 02123456 を参照する API route definitions。', literatureQuery)
    })
    expect(confirm).not.toHaveBeenCalled()
    expect(fetchImpl).toHaveBeenCalledOnce()
    const sent = (fetchImpl.mock.calls[0]?.[1] as RequestInit).body as string
    // Still masked: not reviewing it is not the same as sending it.
    expect(sent).not.toContain('02123456')
    // Zero-notice case, so this line is the whole record: assert it exists, carries the stable id, the
    // count and the categories, and that no original text leaked into it.
    expect(loggerInfo).toHaveBeenCalledOnce()
    const notice = loggerInfo.mock.calls[0] as [string, Record<string, unknown>]
    expect(notice[0]).toBe('application prompt text released without review')
    expect(notice[1]).toMatchObject({
      code: 'PHI-REVIEW-SKIP-01',
      hits: 1,
      categories: ['INSURER_NO']
    })
    const serialized = JSON.stringify(notice)
    expect(serialized).not.toContain('02123456')
    expect(serialized).not.toContain('保険者番号')
  })

  it('still reviews a replacement in the user content, and reports prompt hits as handled', async () => {
    const { gate, createMemoryPhiVault, fetchProviderRequest } = await loadPhi()
    // Approved machine: the point of this case is the review path, not the approval block above it.
    gate.installMachineApproval(() => true)
    gate.installPhiGate(gate.createVaultBackedGate(createMemoryPhiVault()))
    const previews: unknown[] = []
    gate.installPhiConfirmer(async (preview) => {
      previews.push(preview)
      return { confirmed: true, extraSpans: [] }
    })
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('{}'))
    await fetchProviderRequest(fetchImpl, 'https://gateway.invalid/v1/responses', {
      method: 'POST',
      body: body('保険者番号 02123456 を参照する。', '患者：山田 太郎 の再入院を調べてください。')
    })
    expect(previews).toHaveLength(1)
    const preview = previews[0] as { highlights: unknown[]; applicationReplacements: number }
    // Only the user's own replacement is review work; the prompt's replacement is counted separately.
    expect(preview.highlights).toHaveLength(1)
    expect(preview.applicationReplacements).toBe(1)
    // The prompt's replacement is still reported to support even when the window does open for another
    // reason: one notice, still without the replaced text.
    expect(loggerInfo).toHaveBeenCalledOnce()
    expect(JSON.stringify(loggerInfo.mock.calls[0])).not.toContain('02123456')
    const sent = (fetchImpl.mock.calls[0]?.[1] as RequestInit).body as string
    expect(sent).not.toContain('山田 太郎')
    expect(sent).not.toContain('02123456')
  })
})

describe('physician role boundaries', () => {
  it('does not read PI inside a word or a chemical name as a physician name', async () => {
    const { detectPhi } = await import('./detect')
    // `API` covers the original bug (PI inside a word); `PI3K` covers the right-hand boundary: a compound
    // name must not be read as a role label followed by a 24-character name.
    for (const text of [
      'now checking the API route definitions now',
      'The PI3K/AKT pathway is central to this analysis.',
      'PI3K inhibitors were discussed.'
    ]) {
      const hits = detectPhi(text)
      expect(
        hits.some((span) => span.category === 'PHYSICIAN_NAME'),
        text
      ).toBe(false)
    }
  })

  it('keeps a standalone role label as a physician name', async () => {
    const { detectPhi } = await import('./detect')
    for (const text of [
      'PI: 山田',
      'PI 山田 太郎',
      'CRC: 佐藤 花子',
      'Dr. 山田 太郎',
      '担当医 山田 太郎'
    ]) {
      const hits = detectPhi(text)
      expect(
        hits.some((span) => span.category === 'PHYSICIAN_NAME'),
        text
      ).toBe(true)
    }
  })
})
