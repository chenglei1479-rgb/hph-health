import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'
import { SkillRegistry } from './registry'
import { BuiltinSpecialistRegistry } from '../specialist/builtin-registry'
import { validateNotebookHelperExports } from '../notebook/python-command'
import { parseDelegateRpcCall } from '../host-sdk/delegate-contract'
import {
  prepareStructuredOutputSchema,
  validateStructuredOutputValue
} from '../delegation/structured-output'

it('discovers the project helper and validates all three expert packages against the actual skill catalog', async () => {
  const skills = await new SkillRegistry(resolve('resources/skills')).list()
  const project = skills.find((item) => item.id === 'dra-research-project')
  expect(project?.helpers?.[0]?.exports).toHaveLength(10)
  const result = await new BuiltinSpecialistRegistry(
    {
      appVersion: '0.1.22',
      builtinSkills: skills.map((item) => ({
        id: item.id,
        appVersion: '0.1.22',
        compatibility: item.compatibility || 'test-compatibility'
      })),
      skills: skills.map((item) => ({ id: item.id, builtin: true })),
      connectorIds: [],
      protectedSpecialistIds: ['reviewer']
    },
    resolve('resources/specialists')
  ).load()
  expect(result.diagnostics.filter((item) => item.severity === 'error')).toEqual([])
  for (const id of ['dra-literature-expert', 'dra-statistics-expert', 'dra-writing-reviewer']) {
    const expert = result.entries.find((item) => item.id === id)
    expect(expert).toBeDefined()
    expect(expert?.skillIds).toContain('dra-research-project')
  }
})

it.skipIf(!process.env.DRA_TEST_PYTHON)(
  'validates the callable Notebook helper through the production isolated export validator',
  async () => {
    const root = resolve('resources/skills/dra-research-project')
    const manifest = JSON.parse(await readFile(resolve(root, 'open-science.json'), 'utf8'))
    await validateNotebookHelperExports(
      'dra-research-project',
      await readFile(resolve(root, 'kernel.py'), 'utf8'),
      manifest.helpers[0].exports,
      {
        python: { command: process.env.DRA_TEST_PYTHON!, baseArgs: [] }
      }
    )
  }
)

it.skipIf(!process.env.DRA_TEST_PYTHON)(
  'accepts the prepared expert batch through production delegation and structured-output validation',
  async () => {
    const code = [
      'import json, runpy, sys',
      'h = runpy.run_path(sys.argv[1])',
      'p = h["create_research_project"]("SYNTHETIC contract test", "test-project")',
      'v = {role: ["test-artifact-version"] for role in ["literature", "statistics", "writing"]}',
      'print(json.dumps(h["prepare_expert_collaboration"](p, v, "test-confirmation", "test1")))'
    ].join('\n')
    const { stdout } = await promisify(execFile)(process.env.DRA_TEST_PYTHON!, [
      '-c',
      code,
      resolve('resources/skills/dra-research-project/kernel.py')
    ])
    const prepared: {
      requests: {
        task: string
        name: string
        profile: string
        inputs: string[]
        outputSchema: { properties: { role: { const: string } } }
      }[]
      options: { wait: boolean }
    } = JSON.parse(stdout)
    const request = prepared.requests.map(({ outputSchema, ...item }) => ({
      ...item,
      output_schema: outputSchema
    }))
    const parsed = parseDelegateRpcCall({ request, options: prepared.options })
    expect(parsed.options.wait).toBe(false)
    expect(parsed.request).toHaveLength(3)
    for (const item of prepared.requests) {
      const schema = prepareStructuredOutputSchema(item.outputSchema)
      const role = item.outputSchema.properties.role.const
      expect(
        validateStructuredOutputValue(schema, { role, findings: [], limitations: [] })
      ).toEqual({
        role,
        findings: [],
        limitations: []
      })
      expect(() =>
        validateStructuredOutputValue(schema, {
          role: 'unexpected',
          findings: [],
          limitations: []
        })
      ).toThrow()
    }
  }
)
