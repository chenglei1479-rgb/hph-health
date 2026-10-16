import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { spawnSync } from 'node:child_process'

const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.yml', '.yaml'])
const URL_PATTERN = /(?:https?|wss?):\/\/([^/?#\s"'`<>)\]}]+)/gi

const excluded = (path) => {
  const value = path.replaceAll('\\', '/')
  if (value === 'package-lock.json' || value.endsWith('/package-lock.json')) return true
  if (value.startsWith('docs/') || value.startsWith('e2e/') || value.startsWith('test/')) return true
  if (value === 'node_modules' || value.startsWith('node_modules/') || value.includes('/node_modules/'))
    return true
  if (value.includes('/locales/') || value.startsWith('locales/')) return true
  if (
    value.includes('/fixtures/') ||
    value.includes('/__fixtures__/') ||
    value.includes('/test/') ||
    value.includes('/tests/')
  )
    return true
  return /\.(test|spec)\.(ts|tsx|js|mjs|cjs)$/.test(value)
}

const HOST_NAME = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?)+$/

export const keepHost = (host) => {
  const value = host
    .toLowerCase()
    .replace(/[.,;\\]+$/, '')
    .replace(/\.$/, '')
    .replace(/:\d+$/, '')
  if (!HOST_NAME.test(value)) return false
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return false
  if (value.includes('replace_with')) return false
  if (['example.com', 'example.org', 'example.net', 'localhost'].includes(value)) return false
  const labels = value.split('.')
  if (labels.some((label) => ['example', 'invalid', 'test', 'local', 'localhost'].includes(label)))
    return false
  return true
}

export const hostsInText = (text) => {
  const found = new Set()
  for (const match of text.matchAll(URL_PATTERN)) {
    const host = match[1].split(':')[0].replace(/[.,;\\]+$/, '')
    if (keepHost(host)) found.add(host.toLowerCase())
  }
  return found
}

const PATHSPECS = [
  '*.ts',
  '*.tsx',
  '*.js',
  '*.mjs',
  '*.cjs',
  '*.json',
  '*.yml',
  '*.yaml',
  ':(exclude)**/*.test.ts',
  ':(exclude)**/*.test.tsx',
  ':(exclude)**/*.test.js',
  ':(exclude)**/*.test.mjs',
  ':(exclude)**/*.test.cjs',
  ':(exclude)**/*.spec.ts',
  ':(exclude)**/*.spec.tsx',
  ':(exclude)**/*.spec.js',
  ':(exclude)**/*.spec.mjs',
  ':(exclude)**/*.spec.cjs',
  ':(exclude)**/test/**',
  ':(exclude)**/tests/**',
  ':(exclude)**/fixtures/**',
  ':(exclude)**/__fixtures__/**',
  ':(exclude)**/locales/**',
  ':(exclude)e2e/**',
  ':(exclude)docs/**',
  ':(exclude)test/**',
  ':(exclude)package-lock.json',
  ':(exclude)**/package-lock.json',
  ':(exclude)node_modules/**'
]

const gitMatches = (tree) => {
  const result = spawnSync(
    'git',
    ['grep', '-I', '-n', '-E', 'https?://|wss?://', tree, '--', ...PATHSPECS],
    { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 }
  )
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(result.stderr || `git grep failed with ${result.status}`)
  }
  const matches = []
  for (const line of (result.stdout || '').split('\n')) {
    if (!line) continue
    const prefix = `${tree}:`
    if (!line.startsWith(prefix)) continue
    const rest = line.slice(prefix.length)
    const split = rest.indexOf(':')
    const path = rest.slice(0, split)
    const text = rest.slice(split + 1).replace(/^\d+:/, '')
    if (!excluded(path)) matches.push({ path, text })
  }
  return matches
}

const diskFiles = (root, directory = root) => {
  const found = []
  for (const entry of readdirSync(directory)) {
    if (entry === '.git' || entry === 'node_modules' || entry === 'out' || entry === 'dist') continue
    const absolute = join(directory, entry)
    const info = statSync(absolute)
    if (info.isDirectory()) {
      found.push(...diskFiles(root, absolute))
      continue
    }
    if (!EXTENSIONS.has(extname(entry))) continue
    const path = relative(root, absolute)
    if (!excluded(path)) found.push(path)
  }
  return found
}

const addHosts = (hosts, path, text) => {
  for (const host of hostsInText(text)) {
    const paths = hosts.get(host) ?? []
    if (paths.length < 8 && !paths.includes(path)) paths.push(path)
    hosts.set(host, paths)
  }
}

export const collectHosts = ({ root = process.cwd(), gitTree = '' } = {}) => {
  const hosts = new Map()
  if (gitTree) {
    for (const match of gitMatches(gitTree)) addHosts(hosts, match.path, match.text)
    return hosts
  }
  for (const path of diskFiles(root)) addHosts(hosts, path, readFileSync(join(root, path), 'utf8'))
  return hosts
}
