/* eslint-disable @typescript-eslint/explicit-function-return-type */
// Builds THIRD_PARTY_NOTICES.txt from installed npm production dependencies and the
// bundled schema-notebook Python stack. Packaging runs this before electron-builder copies
// the file into every installer.

import { createRequire } from 'node:module'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUTPUT = join(ROOT, 'THIRD_PARTY_NOTICES.txt')
const require = createRequire(join(ROOT, 'package.json'))

const LICENSE_FILES = [
  'LICENSE',
  'LICENSE.md',
  'LICENSE.txt',
  'LICENSE.MIT',
  'LICENCE',
  'LICENCE.md',
  'COPYING',
  'COPYING.txt'
]

export const BUNDLED_PYTHON = [
  {
    name: 'CPython',
    version: '3.12.15',
    license: 'Python Software Foundation License Version 2',
    source:
      'Bundled by scripts/stage-schema-notebook-python.mjs from the python-build-standalone install_only_stripped archive (release 20261013).',
    text: `PYTHON SOFTWARE FOUNDATION LICENSE VERSION 2
This bundled interpreter is CPython. Copyright (c) 2001-2026 Python Software Foundation. All rights reserved.

The full license text is the Python Software Foundation License Version 2, published at
https://docs.python.org/3/license.html and included with the CPython source. The python-build-standalone
redistribution that supplies this prefix is itself under the PSF license for CPython plus the
licenses of its build tooling, which are not linked into the running interpreter.`
  },
  {
    name: 'pandas',
    license: 'BSD-3-Clause',
    source: 'resources/schema-notebook-python/requirements.txt'
  },
  {
    name: 'numpy',
    license: 'BSD-3-Clause',
    source: 'resources/schema-notebook-python/requirements.txt'
  },
  {
    name: 'scipy',
    license: 'BSD-3-Clause',
    source: 'resources/schema-notebook-python/requirements.txt'
  },
  {
    name: 'statsmodels',
    license: 'BSD-3-Clause',
    source: 'resources/schema-notebook-python/requirements.txt'
  },
  {
    name: 'matplotlib',
    license: 'Matplotlib License (BSD-compatible)',
    source: 'resources/schema-notebook-python/requirements.txt',
    text: `Matplotlib is covered by the Matplotlib license, a BSD-compatible license.
Copyright (c) 2012- Matplotlib Development Team. All rights reserved.
https://matplotlib.org/stable/users/project/license.html`
  },
  {
    name: 'openpyxl',
    license: 'MIT',
    source: 'resources/schema-notebook-python/requirements.txt'
  },
  {
    name: 'lifelines',
    license: 'MIT',
    source: 'resources/schema-notebook-python/requirements.txt'
  }
]

const BSD3 = `BSD 3-Clause License

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.`

const MIT = `MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`

function standardText(license) {
  const id = String(license).toUpperCase()
  if (id.includes('BSD-3') || id.includes('BSD 3')) return BSD3
  if (id === 'MIT' || id.startsWith('MIT')) return MIT
  return ''
}

function licenseId(value) {
  if (!value) return 'UNKNOWN'
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(licenseId).join(' OR ')
  if (typeof value === 'object' && value.type) return String(value.type)
  return 'UNKNOWN'
}

function readLicenseFile(directory) {
  for (const name of LICENSE_FILES) {
    const path = join(directory, name)
    if (!existsSync(path)) continue
    const text = readFileSync(path, 'utf8').trim()
    if (text) return text.slice(0, 80_000)
  }
  return ''
}

function packageJsonPath(root, name) {
  const nested = join(root, 'node_modules', ...name.split('/'), 'package.json')
  if (existsSync(nested)) return nested
  if (root !== ROOT) return null
  try {
    return require.resolve(`${name}/package.json`)
  } catch {
    return null
  }
}

export function collectNpmProductionNotices(root = ROOT) {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const direct = Object.keys(manifest.dependencies ?? {})
  const seen = new Set()
  const queue = [...direct]
  const notices = []
  while (queue.length) {
    const name = queue.shift()
    if (!name || seen.has(name)) continue
    seen.add(name)
    const manifestPath = packageJsonPath(root, name)
    if (!manifestPath) {
      notices.push({ name, version: 'unresolved', license: 'UNKNOWN', text: '' })
      continue
    }
    const pkg = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const directory = dirname(manifestPath)
    notices.push({
      name: pkg.name || name,
      version: pkg.version || 'unknown',
      license: licenseId(pkg.license),
      text: readLicenseFile(directory) || standardText(licenseId(pkg.license))
    })
    for (const child of Object.keys(pkg.dependencies ?? {})) queue.push(child)
  }
  notices.sort((a, b) => a.name.localeCompare(b.name))
  return { direct, notices }
}

export function renderThirdPartyNotices(npm = collectNpmProductionNotices()) {
  const lines = [
    'THIRD-PARTY NOTICES',
    '',
    'DRA distributes third-party software under the licenses below. This file is generated',
    'at build time by scripts/generate-third-party-notices.mjs. It covers npm production',
    'dependencies and the Python interpreter and packages bundled for the schema notebook.',
    'Direct production dependencies are listed first; transitive production dependencies follow.',
    ''
  ]
  lines.push('Direct npm production dependencies:')
  for (const name of npm.direct.sort()) lines.push(`- ${name}`)
  lines.push('', '=== npm production dependency notices ===', '')
  for (const notice of npm.notices) {
    lines.push(`--- ${notice.name}@${notice.version} (${notice.license}) ---`)
    lines.push(
      notice.text ||
        `License: ${notice.license}. No license file was found in the installed package.`
    )
    lines.push('')
  }
  lines.push('=== Bundled Python (schema notebook) ===', '')
  lines.push(
    'The unsigned desktop build stages one relocatable CPython prefix and the packages in',
    'resources/schema-notebook-python/requirements.txt. Those packages are not fetched on first',
    'launch. Their license terms are:'
  )
  lines.push('')
  for (const item of BUNDLED_PYTHON) {
    lines.push(`--- ${item.name}${item.version ? ` ${item.version}` : ''} (${item.license}) ---`)
    if (item.source) lines.push(`Source: ${item.source}`)
    lines.push(item.text || standardText(item.license) || `License: ${item.license}`)
    lines.push('')
  }
  return `${lines.join('\n').trim()}\n`
}

export function writeThirdPartyNotices(root = ROOT) {
  const text = renderThirdPartyNotices(collectNpmProductionNotices(root))
  writeFileSync(join(root, 'THIRD_PARTY_NOTICES.txt'), text)
  return text
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isCli) {
  const text = writeThirdPartyNotices()
  const missing = [
    'pandas',
    'numpy',
    'scipy',
    'statsmodels',
    'matplotlib',
    'openpyxl',
    'lifelines',
    'CPython'
  ].filter((name) => !text.includes(name))
  if (missing.length) {
    console.error(`THIRD_PARTY_NOTICES.txt is missing ${missing.join(', ')}`)
    process.exit(1)
  }
  if (!existsSync(OUTPUT)) process.exit(1)
}
