import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { SCHEMA_NOTEBOOK_LOCAL_FILENAME } from '../../../shared/schema-notebook'
import type { PythonCommand } from '../python-command'
import { executeLocalAnalysis, type CommandRunner } from './local-execute'

describe('executeLocalAnalysis runner contract', () => {
  it.each<PythonCommand>([
    {
      command: 'C:/Program Files/DRA/resources/schema-notebook-python/win-x64/python.exe',
      baseArgs: []
    },
    { command: 'py', baseArgs: ['-3'] }
  ])('passes the complete PythonCommand for $command', async (command) => {
    const resolvePython = vi.fn(async () => command)
    const run = vi.fn<CommandRunner>(async (received, scriptPath, cwd, env) => {
      expect(typeof received).toBe('object')
      expect(received).toBe(command)
      expect([...received.baseArgs]).toEqual(command.baseArgs)
      expect(scriptPath).toBe(join(cwd, 'analysis.py'))
      expect(await readFile(scriptPath, 'utf8')).toBe('print(1+1)')
      expect(env).toEqual({
        ...process.env,
        DRA_SCHEMA_TABLE: join(cwd, SCHEMA_NOTEBOOK_LOCAL_FILENAME)
      })
      expect(await readFile(env.DRA_SCHEMA_TABLE!, 'utf8')).toBe('value\n1\n')
      return { stdout: '2', stderr: '', code: 0 }
    })

    const result = await executeLocalAnalysis({
      language: 'python',
      code: 'print(1+1)',
      tableCsv: 'value\n1\n',
      resolvePython,
      run
    })

    expect(resolvePython).toHaveBeenCalledOnce()
    expect(run).toHaveBeenCalledOnce()
    expect(result).toEqual({ stdout: '2', stderr: '', exitCode: 0 })
  })
})
