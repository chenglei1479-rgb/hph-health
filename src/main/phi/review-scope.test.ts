// #160: the review window must only ask about text the doctor wrote. `instructions` is the agent prompt
// the CLI composes (our base instructions, the registered Skill catalog, project AGENTS.md), and the
// physician-name rule used to read English prose inside it as a name ("API route definitions" matched the
// `PI` inside `API`), so a clean project's literature request opened a review window full of our own
// prompt. The release scan still rewrites that text; it is just not review work.
import { describe, expect, it, vi } from 'vitest'

import { fetchProviderRequest } from '../settings/provider-fetch'
import { createVaultBackedGate, installMachineApproval, installPhiConfirmer, installPhiGate } from './gate'
import { createMemoryPhiVault } from './store'

const installIdentityGate = (): void => {
  installPhiGate({
    release: (text) => ({ text, replacements: [], warnings: [] }),
    restore: (text) => text
  })
}

const body = (instructions: string, input: string): string =>
  JSON.stringify({
    model: 'gpt-5',
    instructions,
    input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: input }] }]
  })

const literatureQuery = 'PubMedで「再入院」を検索し、J-STAGEで「再入院」を検索してください。'

describe('review scope for application-owned prompt text', () => {
  it('sends without review when only the application prompt was rewritten', async () => {
    installMachineApproval(null)
    installPhiGate(createVaultBackedGate(createMemoryPhiVault()))
    const confirm = vi.fn(async () => ({ confirmed: true, extraSpans: [] }))
    installPhiConfirmer(confirm)
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('{}'))
    try {
      await fetchProviderRequest(fetchImpl, 'https://gateway.invalid/v1/responses', {
        method: 'POST',
        body: body('保険者番号 02123456 を参照する API route definitions。', literatureQuery)
      })
      expect(confirm).not.toHaveBeenCalled()
      expect(fetchImpl).toHaveBeenCalledOnce()
      const sent = (fetchImpl.mock.calls[0]?.[1] as RequestInit).body as string
      // Still masked: not reviewing it is not the same as sending it.
      expect(sent).not.toContain('02123456')
    } finally {
      installPhiConfirmer(null)
      installMachineApproval(null)
      installIdentityGate()
    }
  })

  it('still reviews a replacement in the user content, and reports prompt hits as handled', async () => {
    // Approved machine: the point of this case is the review path, not the approval block above it.
    installMachineApproval(() => true)
    installPhiGate(createVaultBackedGate(createMemoryPhiVault()))
    const previews: unknown[] = []
    installPhiConfirmer(async (preview) => {
      previews.push(preview)
      return { confirmed: true, extraSpans: [] }
    })
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('{}'))
    try {
      await fetchProviderRequest(fetchImpl, 'https://gateway.invalid/v1/responses', {
        method: 'POST',
        body: body('保険者番号 02123456 を参照する。', '患者：山田 太郎 の再入院を調べてください。')
      })
      expect(previews).toHaveLength(1)
      const preview = previews[0] as { highlights: unknown[]; applicationReplacements: number }
      // Only the user's own replacement is review work; the prompt's replacement is counted separately.
      expect(preview.highlights).toHaveLength(1)
      expect(preview.applicationReplacements).toBe(1)
      const sent = (fetchImpl.mock.calls[0]?.[1] as RequestInit).body as string
      expect(sent).not.toContain('山田 太郎')
      expect(sent).not.toContain('02123456')
    } finally {
      installPhiConfirmer(null)
      installMachineApproval(null)
      installIdentityGate()
    }
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
