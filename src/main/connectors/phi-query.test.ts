import { describe, expect, it, vi } from 'vitest'

import { PhiGateError } from '../phi/gate'
import { ParserEngine } from './engine'
import { JAPAN_RESEARCH_TOOLS } from './descriptors/japan-research'

describe('connector query PHI gate', () => {
  it('refuses patient information before the request is sent', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    const engine = new ParserEngine({ fetchImpl, retries: 0 })
    const tool = JAPAN_RESEARCH_TOOLS.find((entry) => entry.id === 'jstage_search')!
    await expect(engine.call(tool, { query: '患者氏名: 山田太郎' }, {})).rejects.toBeInstanceOf(
      PhiGateError
    )
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('still sends an ordinary literature query', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        '<feed><result><status>0</status><totalResults>0</totalResults><startIndex>1</startIndex></feed>',
        {
          status: 200,
          headers: { 'content-type': 'application/xml' }
        }
      )
    )
    const engine = new ParserEngine({ fetchImpl, retries: 0 })
    const tool = JAPAN_RESEARCH_TOOLS.find((entry) => entry.id === 'jstage_search')!
    await expect(engine.call(tool, { query: '肺癌' }, {})).rejects.toThrow('Invalid J-STAGE XML')
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(String(fetchImpl.mock.calls[0][0])).toContain(encodeURIComponent('肺癌'))
  })
})
