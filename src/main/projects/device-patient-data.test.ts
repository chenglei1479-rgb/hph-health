import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { deleteDevicePatientData } from './device-patient-data'

const roots: string[] = []

afterEach(async () => {
  const { rm } = await import('node:fs/promises')
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

const tempRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'device-patient-data-'))
  roots.push(root)
  return root
}

describe('deleteDevicePatientData', () => {
  it('removes imported copies, notebook caches, and analysis intermediates for one project', async () => {
    const root = await tempRoot()
    const session = join(root, 'notebooks', 'project-1', 'session-1')
    const frame = join(session, 'frames', 'frame-1')
    const other = join(root, 'notebooks', 'project-2', 'session-2')
    await mkdir(join(session, 'data', 'inputs'), { recursive: true })
    await mkdir(join(session, 'data', 'outputs'), { recursive: true })
    await mkdir(join(session, 'cache'), { recursive: true })
    await mkdir(join(session, 'hpc', 'job-1'), { recursive: true })
    await mkdir(join(frame, 'data', 'inputs'), { recursive: true })
    await mkdir(join(frame, 'cache'), { recursive: true })
    await mkdir(join(root, 'notebook-inputs', 'project-1', 'session-1'), { recursive: true })
    await mkdir(join(other, 'data', 'inputs'), { recursive: true })
    await writeFile(join(session, 'run.json'), '{"kept":true}\n')
    await writeFile(join(session, 'data', 'inputs', 'cohort.csv'), 'id,value\n')
    await writeFile(join(session, 'data', 'table.csv'), 'aggregate\n')
    await writeFile(join(session, 'cache', 'dependency-analysis.json'), '{}\n')
    await writeFile(join(session, 'hpc', 'job-1', 'result.csv'), 'intermediate\n')
    await writeFile(join(frame, 'data', 'inputs', 'copy.csv'), 'copy\n')
    await writeFile(join(root, 'notebook-inputs', 'project-1', 'session-1', 'content'), 'staged\n')
    await writeFile(join(other, 'data', 'inputs', 'keep.csv'), 'other\n')
    await writeFile(join(other, 'run.json'), '{}\n')

    await deleteDevicePatientData(root, 'project-1')

    await expect(readFile(join(session, 'run.json'), 'utf8')).resolves.toContain('kept')
    await expect(readFile(join(other, 'data', 'inputs', 'keep.csv'), 'utf8')).resolves.toBe(
      'other\n'
    )
    await expect(readFile(join(session, 'data', 'inputs', 'cohort.csv'), 'utf8')).rejects.toThrow()
    await expect(readFile(join(session, 'data', 'table.csv'), 'utf8')).rejects.toThrow()
    await expect(
      readFile(join(session, 'cache', 'dependency-analysis.json'), 'utf8')
    ).rejects.toThrow()
    await expect(readFile(join(session, 'hpc', 'job-1', 'result.csv'), 'utf8')).rejects.toThrow()
    await expect(readFile(join(frame, 'data', 'inputs', 'copy.csv'), 'utf8')).rejects.toThrow()
    await expect(
      readFile(join(root, 'notebook-inputs', 'project-1', 'session-1', 'content'), 'utf8')
    ).rejects.toThrow()
  })

  it('unlinks a working-folder symlink without deleting the original source file', async () => {
    const root = await tempRoot()
    const outside = await tempRoot()
    const original = join(outside, 'source.xlsx')
    await writeFile(original, 'original-workbook')
    const session = join(root, 'notebooks', 'project-1', 'session-1', 'data', 'inputs')
    await mkdir(session, { recursive: true })
    await symlink(original, join(session, 'source.xlsx'))

    await deleteDevicePatientData(root, 'project-1')

    await expect(readFile(original, 'utf8')).resolves.toBe('original-workbook')
  })
})
