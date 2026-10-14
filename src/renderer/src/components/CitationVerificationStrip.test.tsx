// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  resetCitationVerificationState,
  verifyCitations
} from '../../../shared/citation-verification'
import { CitationVerificationStrip } from './CitationVerificationStrip'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(process.cwd(), 'src/shared/citations/fixtures', name), 'utf8'))

describe('CitationVerificationStrip', () => {
  let container: HTMLDivElement
  let root: Root

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    resetCitationVerificationState()
  })

  it('shows verified, mismatch, and not-found badges from recorded metadata', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('28877013')) {
        return new Response(JSON.stringify(fixture('pubmed-28877013.json')), { status: 200 })
      }
      return new Response(JSON.stringify(fixture('pubmed-missing.json')), { status: 200 })
    })
    const text =
      'Smith et al. "Completely different article title" 1999 PMID: 28877013. Also PMID: 99999999.'
    const checks = await verifyCitations(text, { fetchImpl })
    const verify = (): ReturnType<typeof verifyCitations> => Promise.resolve(checks)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root.render(<CitationVerificationStrip text={text} verify={verify} />)
    })
    const list = container.querySelector('[data-testid="citation-checks"]')
    expect(list?.textContent).toContain('PMID 28877013')
    expect(list?.textContent).toContain('Citation mismatch')
    expect(list?.textContent).toContain('PMID 99999999')
    expect(list?.textContent).toContain('Citation not found')
    expect(JSON.stringify(fetchImpl.mock.calls)).not.toContain('Completely different')
  })
})
