import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const FORBIDDEN = /\b(AGPL|LGPL|GPL|SSPL)\b/i

const baselineRef = () => {
  const preferred = process.env.LICENSE_BASELINE_REF || 'origin/main'
  for (const ref of [preferred, 'main']) {
    const result = spawnSync('git', ['cat-file', '-e', `${ref}:package-lock.json`])
    if (result.status === 0) return ref
  }
  throw new Error('Cannot read package-lock.json from origin/main or main')
}

const baselineNames = () => {
  const ref = baselineRef()
  const result = spawnSync('git', ['show', `${ref}:package-lock.json`], {
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024
  })
  if (result.status !== 0) throw new Error(result.stderr || 'failed to read baseline lockfile')
  const lock = JSON.parse(result.stdout)
  const names = new Set()
  for (const path of Object.keys(lock.packages ?? {})) {
    const name = path.split('node_modules/').pop()
    if (name) names.add(name)
  }
  return { ref, names }
}

const licenseText = (value) => {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object' && typeof value.type === 'string') return value.type
  if (Array.isArray(value)) return value.map(licenseText).filter(Boolean).join(' OR ')
  return ''
}

const permissiveBranch = (expression) => {
  const branches = expression.replace(/[()]/g, ' ').split(/\s+OR\s+/i)
  return branches.some((branch) => !FORBIDDEN.test(branch))
}

const walk = (directory, found = []) => {
  let entries = []
  try {
    entries = readdirSync(directory)
  } catch {
    return found
  }
  for (const entry of entries) {
    if (entry === '.bin') continue
    const absolute = join(directory, entry)
    let info
    try {
      info = statSync(absolute)
    } catch {
      continue
    }
    if (!info.isDirectory()) continue
    if (entry === 'node_modules') {
      walk(absolute, found)
      continue
    }
    const manifest = join(absolute, 'package.json')
    try {
      const pkg = JSON.parse(readFileSync(manifest, 'utf8'))
      if (pkg.name) found.push({ name: pkg.name, version: pkg.version ?? '', license: licenseText(pkg.license) || licenseText(pkg.licenses) })
    } catch {
      // A scoped directory has no package.json of its own.
    }
    if (entry.startsWith('@')) walk(absolute, found)
  }
  return found
}

const { ref, names } = baselineNames()
const packages = walk(join(process.cwd(), 'node_modules'))
const seen = new Set()
const copyleft = []
const rejected = []
for (const pkg of packages) {
  const key = `${pkg.name}@${pkg.version}`
  if (seen.has(key)) continue
  seen.add(key)
  if (!pkg.license || !FORBIDDEN.test(pkg.license)) continue
  if (permissiveBranch(pkg.license)) {
    copyleft.push(`${key}  ${pkg.license}  (permissive alternative kept)`)
    continue
  }
  const row = `${key}  ${pkg.license}`
  if (names.has(pkg.name)) copyleft.push(`${row}  (present on ${ref})`)
  else rejected.push(row)
}

console.log(`license baseline ${ref} (${names.size} lockfile packages)`)
console.log(`scanned ${seen.size} installed packages`)
if (copyleft.length) {
  console.log('copyleft notices:')
  for (const row of copyleft.sort()) console.log(`  ${row}`)
}
if (rejected.length) {
  console.error('New GPL/AGPL-family packages are not allowed:')
  for (const row of rejected.sort()) console.error(`  ${row}`)
  process.exit(1)
}
console.log('license scan ok')
