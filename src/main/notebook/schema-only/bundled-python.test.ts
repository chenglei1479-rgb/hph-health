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
      probe: async () => '3.12.15',
      findSystemPython
    })

    expect(resolved).toEqual({
      ok: true,
      source: 'bundled',
      command: { command: bundled, baseArgs: [] },
      version: '3.12.15'
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
        return '3.12.15'
      },
      findSystemPython: async () => undefined
    })

    expect(probed).toEqual([packaged])
    expect(resolved.ok && resolved.command.command).toBe(packaged)
  })

  it('finds the packaged prefix under a spaced, non-ASCII install path on another drive', async () => {
    // Beta builds install to a user-chosen folder; the acceptance build used "D:\<CJK>\...".
    const resourcesPath = 'D:/惠每资料/medresearch-agent/resources'
    const bundled = bundledPythonExecutable(
      `${resourcesPath}/schema-notebook-python`,
      'win32',
      'x64'
    )
    const repoDevRoot = 'C:/repo/resources/schema-notebook-python'
    const resolved = await resolveSchemaNotebookPython({
      platform: 'win32',
      arch: 'x64',
      resourcesPath,
      devRoots: [repoDevRoot],
      exists: (path) => path === bundled,
      probe: async () => '3.12.15',
      findSystemPython: async () => ({ command: 'py', baseArgs: ['-3'] })
    })

    expect(resolved).toEqual({
      ok: true,
      source: 'bundled',
      command: { command: bundled, baseArgs: [] },
      version: '3.12.15'
    })
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
      command: { command: '/usr/local/bin/python3', baseArgs: [] },
      version: 'unknown'
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
    expect(resolved.reason).toBe('missing')
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
          probe: async () => '3.12.15',
          findSystemPython: async () => ({ command: 'python3', baseArgs: [] })
        })
        expect(resolved).toEqual({
          ok: true,
          source: 'bundled',
          command: { command: executable, baseArgs: [] },
          version: '3.12.15'
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
    'reports a broken packaged runtime for the %s %s prefix instead of using PATH',
    async (platform, arch, executable) => {
      const probed: string[] = []
      const findSystemPython = vi.fn(async () => ({ command: 'python3', baseArgs: [] }))
      const resolved = await resolveSchemaNotebookPython({
        platform,
        arch,
        resourcesPath: executable.slice(0, executable.indexOf('/schema-notebook-python')),
        devRoots: [],
        exists: (path) => path === executable,
        probe: async (command) => {
          probed.push(command.command)
          return undefined
        },
        findSystemPython
      })

      expect(probed).toEqual([executable])
      // A packaged prefix that exists but cannot start is a broken installation, not a reason to run
      // the script with whatever Python is on PATH: that one usually lacks pandas and fails later
      // with a message about the script instead of the runtime.
      expect(resolved).toEqual({
        ok: false,
        reason: 'unusable',
        message: 'The bundled Python runtime could not start, so the analysis was not run. Reinstall the app.'
      })
      expect(findSystemPython).not.toHaveBeenCalled()
    }
  )

  it('still falls through to PATH when a developer checkout prefix cannot run', async () => {
    const devRoot = '/repo/resources/schema-notebook-python'
    const dev = bundledPythonExecutable(devRoot, 'darwin', 'arm64')
    const resolved = await resolveSchemaNotebookPython({
      platform: 'darwin',
      arch: 'arm64',
      resourcesPath: undefined,
      devRoots: [devRoot],
      exists: (path) => path === dev,
      probe: async (command) => (command.command === dev ? undefined : '3.13.1'),
      findSystemPython: async () => ({ command: 'python3', baseArgs: [] })
    })

    expect(resolved).toEqual({
      ok: true,
      source: 'system',
      command: { command: 'python3', baseArgs: [] },
      version: '3.13.1'
    })
  })

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
