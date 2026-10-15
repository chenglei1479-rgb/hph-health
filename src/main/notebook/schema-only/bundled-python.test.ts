import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import {
  SCHEMA_NOTEBOOK_PYTHON_PACKAGES,
  bundledPythonExecutable,
  resolveSchemaNotebookPython
} from './bundled-python'

describe('schema-notebook bundled Python', () => {
  it('uses the installer prefix before any Python on PATH', async () => {
    const findSystemPython = vi.fn(async () => ({ command: 'python3', baseArgs: [] }))
    const bundled = bundledPythonExecutable(
      '/Applications/DRA.app/Contents/Resources/schema-notebook-python',
      'darwin',
      'arm64'
    )
    const resolved = await resolveSchemaNotebookPython({
      platform: 'darwin',
      arch: 'arm64',
      resourcesPath: '/Applications/DRA.app/Contents/Resources',
      devRoots: ['/repo/resources/schema-notebook-python'],
      exists: (path) => path === bundled,
      probe: async () => true,
      findSystemPython
    })

    expect(resolved).toEqual({
      ok: true,
      source: 'bundled',
      command: { command: bundled, baseArgs: [] }
    })
    expect(bundled).toBe(
      '/Applications/DRA.app/Contents/Resources/schema-notebook-python/darwin-arm64/bin/python'
    )
    expect(findSystemPython).not.toHaveBeenCalled()
  })

  it('prefers the packaged prefix over a developer checkout', async () => {
    const packaged = bundledPythonExecutable(
      'C:/Program Files/DRA/resources/schema-notebook-python',
      'win32',
      'x64'
    )
    const dev = bundledPythonExecutable('D:/repo/resources/schema-notebook-python', 'win32', 'x64')
    const probed: string[] = []
    const resolved = await resolveSchemaNotebookPython({
      platform: 'win32',
      arch: 'x64',
      resourcesPath: 'C:/Program Files/DRA/resources',
      devRoots: ['D:/repo/resources/schema-notebook-python'],
      exists: (path) => path === packaged || path === dev,
      probe: async (command) => {
        probed.push(command.command)
        return true
      },
      findSystemPython: async () => undefined
    })

    expect(probed).toEqual([packaged])
    expect(resolved.ok && resolved.command.command).toBe(packaged)
  })

  it('falls back to an already installed Python 3 and never reports a download', async () => {
    const resolved = await resolveSchemaNotebookPython({
      platform: 'linux',
      arch: 'x64',
      resourcesPath: '/opt/dra/resources',
      devRoots: [],
      exists: () => false,
      findSystemPython: async () => ({ command: '/usr/local/bin/python3', baseArgs: [] })
    })

    expect(resolved).toEqual({
      ok: true,
      source: 'system',
      command: { command: '/usr/local/bin/python3', baseArgs: [] }
    })
  })

  it('stops with the bundled path when no interpreter exists', async () => {
    const resolved = await resolveSchemaNotebookPython({
      platform: 'linux',
      arch: 'x64',
      resourcesPath: '/opt/dra/resources',
      devRoots: [],
      exists: () => false,
      findSystemPython: async () => undefined
    })

    expect(resolved.ok).toBe(false)
    if (resolved.ok) return
    expect(resolved.message).toContain(
      '/opt/dra/resources/schema-notebook-python/linux-x64/bin/python'
    )
    expect(resolved.message).toContain('not downloaded on first run')
    expect(resolved.message).toContain('lifelines')
  })

  it.each([
    {
      platform: 'win32' as const,
      arch: 'x64',
      resourcesPath: 'D:/DRA/medresearch-agent/resources',
      executable: 'D:/DRA/medresearch-agent/resources/schema-notebook-python/win-x64/python.exe'
    },
    {
      platform: 'darwin' as const,
      arch: 'arm64',
      resourcesPath: '/Applications/DRA.app/Contents/Resources',
      executable:
        '/Applications/DRA.app/Contents/Resources/schema-notebook-python/darwin-arm64/bin/python'
    },
    {
      platform: 'darwin' as const,
      arch: 'x64',
      resourcesPath: '/Applications/DRA.app/Contents/Resources',
      executable:
        '/Applications/DRA.app/Contents/Resources/schema-notebook-python/darwin-x64/bin/python'
    }
  ])(
    'reads the packaged prefix from process.resourcesPath on $platform $arch',
    async ({ platform, arch, resourcesPath, executable }) => {
      const previous = process.resourcesPath
      Object.defineProperty(process, 'resourcesPath', {
        configurable: true,
        value: resourcesPath
      })
      try {
        const asarDevRoot =
          platform === 'win32'
            ? 'D:/DRA/medresearch-agent/resources/app.asar/out/main/../../../resources/schema-notebook-python'
            : '/Applications/DRA.app/Contents/Resources/app.asar/out/main/../../../resources/schema-notebook-python'
        const resolved = await resolveSchemaNotebookPython({
          platform,
          arch,
          devRoots: [asarDevRoot],
          exists: (path) => path === executable,
          probe: async () => true,
          findSystemPython: async () => ({ command: 'python3', baseArgs: [] })
        })
        expect(resolved).toEqual({
          ok: true,
          source: 'bundled',
          command: { command: executable, baseArgs: [] }
        })
      } finally {
        Object.defineProperty(process, 'resourcesPath', {
          configurable: true,
          value: previous
        })
      }
    }
  )

  it.each([
    [
      'win32',
      'x64',
      'D:/DRA/medresearch-agent/resources/schema-notebook-python/win-x64/python.exe'
    ],
    [
      'darwin',
      'arm64',
      '/Applications/DRA.app/Contents/Resources/schema-notebook-python/darwin-arm64/bin/python'
    ],
    [
      'darwin',
      'x64',
      '/Applications/DRA.app/Contents/Resources/schema-notebook-python/darwin-x64/bin/python'
    ]
  ] as const)(
    'falls through when the %s %s prefix exists but cannot run',
    async (platform, arch, executable) => {
      const probed: string[] = []
      const resolved = await resolveSchemaNotebookPython({
        platform,
        arch,
        resourcesPath: executable.slice(0, executable.indexOf('/schema-notebook-python')),
        devRoots: [],
        exists: (path) => path === executable,
        probe: async (command) => {
          probed.push(command.command)
          return false
        },
        findSystemPython: async () => ({ command: 'python3', baseArgs: [] })
      })

      expect(probed).toEqual([executable])
      expect(resolved).toEqual({
        ok: true,
        source: 'system',
        command: { command: 'python3', baseArgs: [] }
      })
    }
  )

  it('lists the offline packages in the staged requirements file', () => {
    const requirements = readFileSync(
      join(process.cwd(), 'resources/schema-notebook-python/requirements.txt'),
      'utf8'
    )
    for (const name of SCHEMA_NOTEBOOK_PYTHON_PACKAGES) {
      expect(requirements).toContain(name)
    }
  })
})
