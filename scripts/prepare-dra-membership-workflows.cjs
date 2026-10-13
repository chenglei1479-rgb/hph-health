/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs')
const path = require('node:path')
const repo = path.resolve(__dirname, '..')
const skills = path.join(repo, 'resources/skills/manifest.json')
const catalog = JSON.parse(fs.readFileSync(skills, 'utf8'))
if (!catalog.skills.some((item) => item.id === 'dra-research-project'))
  catalog.skills.push({
    id: 'dra-research-project',
    name: 'DRA Research Project',
    source: 'featured',
    updatedAt: '2026-10-04T00:00:00.000Z'
  })
fs.writeFileSync(skills, JSON.stringify(catalog, null, 2) + '\n')
const definitions = [
  [
    'dra-literature-expert',
    'DRA Literature Expert',
    ['dra-research-project', 'literature-review'],
    'Review actually retrieved sources, selection criteria, source excerpts, evidence scope and contradictory findings. Record PMID/DOI or source URLs and exact evidence locations. Never invent sources or claim unavailable full text was read.'
  ],
  [
    'dra-statistics-expert',
    'DRA Statistics Expert',
    ['dra-research-project', 'clinical-data-audit'],
    'Review approved endpoints, variable definitions, missingness, analysis assumptions, Notebook Run evidence and diagnostics. Distinguish an unrun plan from actual analysis. Do not execute patient-level analysis or install packages without researcher approval and normal host permissions.'
  ],
  [
    'dra-writing-reviewer',
    'DRA Writing Reviewer',
    ['dra-research-project', 'paper-narrative'],
    'Review manuscript structure, source-to-claim alignment and consistency with actual Notebook results. Flag missing evidence, uncertain interpretations and unapproved decisions. Do not invent numerical results, figures or citations.'
  ]
]
for (const [id, name, skillIds, scope] of definitions) {
  const root = path.join(repo, 'resources/specialists', id)
  fs.mkdirSync(root, { recursive: true })
  fs.writeFileSync(
    path.join(root, 'manifest.json'),
    JSON.stringify(
      { schema_version: 1, id, version: '1.0.0', exported_with_app_version: '0.1.22' },
      null,
      2
    ) + '\n'
  )
  fs.writeFileSync(
    path.join(root, 'specialist.json'),
    JSON.stringify(
      {
        name,
        display_name: name,
        description: scope,
        system_prompt: `You are ${name}. Respond in the researcher's language. ${scope} Follow dra-research-project. Use only the actual tools and approved input artifact versions supplied to this session. Never bypass host membership admission, researcher confirmation, privacy constraints or permission refusals. Report findings with severity, evidence references, affected artifact versions and proposed action. Completion of your response is not resolution of an issue; require explicit researcher acceptance before marking resolution. Separate completed, unresolved, unverified and unrun work.`,
        skill_ids: skillIds,
        connector_ids: []
      },
      null,
      2
    ) + '\n'
  )
}
const manifest = path.join(repo, 'resources/specialists/manifest.json')
const existing = JSON.parse(fs.readFileSync(manifest, 'utf8'))
existing.specialists = [
  ...new Set([...existing.specialists, ...definitions.map((item) => item[0])])
]
fs.writeFileSync(manifest, JSON.stringify(existing, null, 2) + '\n')
console.log('Research workflow helper and three expert profiles registered in candidate resources.')
