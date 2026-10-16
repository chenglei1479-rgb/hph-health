import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { SkillRegistry } from '@aipoch/skills'
import { toUnpackedAsarPath } from './resource-path'

describe('SkillRegistry', () => {
  it('resolves packaged Skill resources outside app.asar without consulting the cwd', () => {
    expect(
      toUnpackedAsarPath(
        '/Applications/DRA.app/Contents/Resources/app.asar/resources/skills'
      )
    ).toBe('/Applications/DRA.app/Contents/Resources/app.asar.unpacked/resources/skills')
    expect(toUnpackedAsarPath('/workspace/resources/skills')).toBe('/workspace/resources/skills')
  })

  it('discovers the bundled figure helper descriptors from the production manifest', async () => {
    const skillsRoot = join(__dirname, '..', '..', '..', 'resources', 'skills')
    const skills = await new SkillRegistry(skillsRoot).list()
    const figureSkills = skills.filter(({ id }) =>
      ['figure-style', 'figure-composer', 'paper-narrative'].includes(id)
    )

    expect(figureSkills.map(({ id }) => id).sort()).toEqual([
      'figure-composer',
      'figure-style',
      'paper-narrative'
    ])
    for (const skill of figureSkills) {
      expect(skill).toMatchObject({ source: 'featured' })
      expect(skill.helpers).toEqual([
        expect.objectContaining({
          id: skill.id,
          language: 'python',
          implementation: 'kernel.py',
          exports: expect.any(Array)
        })
      ])
      expect(skill.helpers?.[0]?.exports.length).toBeGreaterThan(0)
      expect(skill.helpers?.[0]).not.toHaveProperty('source')
    }
  })

  it('lists skills merging manifest metadata with SKILL.md description', async () => {
    const registry = new SkillRegistry(await seedRoot())
    const skills = await registry.list()
    expect(skills).toHaveLength(1)
    expect(skills[0]).toMatchObject({
      id: 'demo',
      name: 'demo',
      displayName: 'Demo',
      description: 'A demo skill.',
      source: 'featured',
      author: 'Test Author',
      license: 'Test License',
      thirdParty: 'Weights — Example (CC-BY-4.0)',
      category: 'biomodels',
      // `requirements: [gpu]` is a YAML list; the flat frontmatter reader joins it to a string. The
      // materializer only substring-matches gpu/compute, so this stays equivalent.
      requirements: 'gpu',
      activationPolicy: 'user-controlled'
    })
  })

  it('reads always-on activation from a trusted bundled manifest', async () => {
    const root = await seedRoot()
    await mkdir(join(root, 'customize'), { recursive: true })
    await writeFile(
      join(root, 'customize', 'SKILL.md'),
      '---\nname: customize\ndescription: Customize DRA.\n---\nBody.'
    )
    await writeFile(
      join(root, 'manifest.json'),
      JSON.stringify({
        version: 1,
        skills: [
          {
            id: 'customize',
            name: 'Customize',
            source: 'featured',
            activationPolicy: 'always-on',
            updatedAt: '2026-01-01'
          },
          {
            id: 'demo',
            name: 'Demo',
            source: 'featured',
            activationPolicy: 'always-on',
            updatedAt: '2026-01-01'
          }
        ]
      })
    )

    expect(await new SkillRegistry(root).list()).toEqual([
      expect.objectContaining({ id: 'customize', activationPolicy: 'always-on' }),
      expect.objectContaining({ id: 'demo', activationPolicy: 'always-on' })
    ])
  })

  it('marks exactly the application-required Skills always-on in the production manifest', async () => {
    const skillsRoot = join(__dirname, '..', '..', '..', 'resources', 'skills')
    const skills = await new SkillRegistry(skillsRoot).list()

    expect(
      skills
        .filter((skill) => skill.activationPolicy === 'always-on')
        .map((skill) => skill.id)
        .sort()
    ).toEqual([
      'compute-env-setup',
      'customize',
      'env-management',
      'remote-compute-ssh',
      'self-awareness',
      'skill-creator'
    ])
  })
})
