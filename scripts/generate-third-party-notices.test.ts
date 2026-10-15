import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { BUNDLED_PYTHON, renderThirdPartyNotices } from './generate-third-party-notices.mjs'

describe('third-party notices', () => {
  const roots: string[] = []

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
  })

  it('names every bundled Python component and the direct npm production dependencies', () => {
    const text = renderThirdPartyNotices({
      direct: ['left-pad', '@scope/pkg'],
      notices: [
        { name: '@scope/pkg', version: '1.2.3', license: 'MIT', text: 'Copyright Example' },
        { name: 'left-pad', version: '2.0.0', license: 'Apache-2.0', text: '' }
      ]
    })
    expect(text).toContain('left-pad')
    expect(text).toContain('@scope/pkg@1.2.3 (MIT)')
    expect(text).toContain('Copyright Example')
    expect(text).toContain('No license file was found')
    for (const item of BUNDLED_PYTHON) expect(text).toContain(item.name)
    expect(text).toContain('Python Software Foundation License Version 2')
    expect(text).toContain('BSD 3-Clause License')
    expect(text).toContain('MIT License')
  })

  it('can be written beside a packaging fixture', async () => {
    const root = await mkdtemp(join(tmpdir(), 'third-party-notices-'))
    roots.push(root)
    await mkdir(join(root, 'node_modules', 'demo'), { recursive: true })
    await writeFile(join(root, 'package.json'), JSON.stringify({ dependencies: { demo: '1.0.0' } }))
    await writeFile(
      join(root, 'node_modules', 'demo', 'package.json'),
      JSON.stringify({ name: 'demo', version: '1.0.0', license: 'MIT' })
    )
    await writeFile(join(root, 'node_modules', 'demo', 'LICENSE'), 'Copyright Demo')
    const { collectNpmProductionNotices } = await import('./generate-third-party-notices.mjs')
    const collected = collectNpmProductionNotices(root)
    expect(collected.direct).toEqual(['demo'])
    expect(collected.notices[0]).toMatchObject({ name: 'demo', license: 'MIT' })
    expect(collected.notices[0].text).toContain('Copyright Demo')
    await writeFile(join(root, 'THIRD_PARTY_NOTICES.txt'), renderThirdPartyNotices(collected))
    expect(await readFile(join(root, 'THIRD_PARTY_NOTICES.txt'), 'utf8')).toContain('demo@1.0.0')
  })
})
