import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { collectHosts } from './egress-hosts.mjs'

const allowlistPath = new URL('../../docs/egress-allowlist.json', import.meta.url)

const commitOf = (ref) => {
  const result = spawnSync('git', ['rev-parse', ref], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stderr || `missing ref ${ref}`)
  return result.stdout.trim()
}

const writeAllowlist = () => {
  const hosts = [...collectHosts({ gitTree: 'main' }).keys()].sort()
  const document = {
    generatedFrom: 'main',
    sourceCommit: commitOf('main'),
    rules:
      'Production .ts .tsx .js .mjs .cjs .json .yml .yaml only. Excludes tests, fixtures, locales, e2e, docs, and package-lock. Drops hosts without a dot, IP addresses, and example/invalid/test/local placeholders.',
    hosts
  }
  writeFileSync(allowlistPath, `${JSON.stringify(document, null, 2)}\n`)
  console.log(`wrote ${hosts.length} hosts to docs/egress-allowlist.json`)
}

const check = () => {
  const document = JSON.parse(readFileSync(allowlistPath, 'utf8'))
  const allowed = new Set(document.hosts)
  const found = collectHosts()
  const unexpected = [...found.keys()].filter((host) => !allowed.has(host)).sort()
  if (unexpected.length === 0) {
    console.log(`egress allowlist ok (${allowed.size} hosts, ${found.size} observed)`)
    return
  }
  console.error('Hosts are not in docs/egress-allowlist.json:')
  for (const host of unexpected) {
    console.error(`  ${host}`)
    for (const path of found.get(host) ?? []) console.error(`    ${path}`)
  }
  process.exitCode = 1
}

if (process.argv.includes('--write-from-main')) writeAllowlist()
else check()
