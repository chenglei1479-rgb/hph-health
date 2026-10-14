import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  PYTHON_STANDALONE_VERSION,
  materializePythonBinary,
  pythonCommand,
  schemaNotebookPythonTarget,
  standaloneArchiveName,
  wheelPlatformTag,
  standaloneArchiveUrl
} from './stage-schema-notebook-python.mjs'

describe('schema-notebook Python staging', () => {
  const roots: string[] = []

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  })

  it('covers the three unsigned beta targets and no others', () => {
    expect(schemaNotebookPythonTarget('mac', 'arm64')).toMatchObject({
      subdir: 'darwin-arm64',
      executable: 'bin/python',
      triple: 'aarch64-apple-darwin'
    })
    expect(schemaNotebookPythonTarget('mac', 'x64').subdir).toBe('darwin-x64')
    expect(schemaNotebookPythonTarget('win', 'x64')).toMatchObject({
      subdir: 'win-x64',
      executable: 'python.exe'
    })
    for (const target of ['mac-arm64', 'mac-x64', 'win-x64'] as const) {
      const [platform, arch] = target.split('-') as ['mac' | 'win', 'arm64' | 'x64']
      const resolved = schemaNotebookPythonTarget(platform, arch)
      expect(resolved.sha256).toMatch(/^[a-f0-9]{64}$/)
      expect(standaloneArchiveName(resolved)).toContain(PYTHON_STANDALONE_VERSION)
      expect(standaloneArchiveUrl(resolved)).toContain(encodeURIComponent('+'))
    }
    expect(() => schemaNotebookPythonTarget('linux', 'x64')).toThrow(
      /mac arm64, mac x64, and win x64/
    )
    expect(wheelPlatformTag(schemaNotebookPythonTarget('mac', 'arm64'))).toBe('macosx_12_0_arm64')
    expect(wheelPlatformTag(schemaNotebookPythonTarget('mac', 'x64'))).toBe('macosx_12_0_x86_64')
    expect(wheelPlatformTag(schemaNotebookPythonTarget('win', 'x64'))).toBe('win_amd64')
  })

  it('runs the x64 interpreter under Rosetta when the Mac builder is arm64', () => {
    const target = schemaNotebookPythonTarget('mac', 'x64')
    expect(
      pythonCommand('/prefix/bin/python', target, { platform: 'darwin', arch: 'arm64' })
    ).toEqual({ command: 'arch', args: ['-x86_64', '/prefix/bin/python'] })
    expect(
      pythonCommand('/prefix/bin/python', target, { platform: 'darwin', arch: 'x64' }).command
    ).toBe('/prefix/bin/python')
    expect(
      pythonCommand('/prefix/bin/python', schemaNotebookPythonTarget('mac', 'arm64'), {
        platform: 'darwin',
        arch: 'arm64'
      }).command
    ).toBe('/prefix/bin/python')
  })

  it('replaces bin/python symlink with a regular executable', () => {
    const dest = mkdtempSync(join(tmpdir(), 'schema-python-'))
    roots.push(dest)
    mkdirSync(join(dest, 'bin'))
    writeFileSync(join(dest, 'bin', 'python3.12'), '#!/bin/sh\n')
    chmodSync(join(dest, 'bin', 'python3.12'), 0o755)
    symlinkSync('python3.12', join(dest, 'bin', 'python'))
    materializePythonBinary(dest, 'bin/python')
    expect(lstatSync(join(dest, 'bin', 'python')).isSymbolicLink()).toBe(false)
  })
})
