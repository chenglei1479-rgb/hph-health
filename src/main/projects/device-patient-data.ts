import { lstat, readdir, realpath, rm, rmdir } from 'node:fs/promises'
import { isAbsolute, join, relative, sep } from 'node:path'

import { NOTEBOOKS_DIR } from '../../shared/notebook'

const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const NOTEBOOK_INPUTS_DIR = 'notebook-inputs'

const isMissing = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code?: unknown }).code === 'ENOENT'

const assertInsideRoot = (rootReal: string, targetReal: string): void => {
  const relativePath = relative(rootReal, targetReal)
  if (
    relativePath === '' ||
    relativePath === '..' ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error('Refusing to delete a path outside the data root.')
  }
}

// Unlinks a symlink without following it. Real files and directories are removed only
// after their canonical path is confirmed to stay inside the data root.
const removeTrusted = async (rootReal: string, candidate: string): Promise<void> => {
  let info
  try {
    info = await lstat(candidate)
  } catch (error) {
    if (isMissing(error)) return
    throw error
  }
  if (info.isSymbolicLink()) {
    await rm(candidate, { force: true })
    return
  }
  const targetReal = await realpath(candidate)
  assertInsideRoot(rootReal, targetReal)
  if (info.isDirectory()) {
    const entries = await readdir(candidate)
    await Promise.all(entries.map((name) => removeTrusted(rootReal, join(candidate, name))))
    await rmdir(candidate)
    return
  }
  if (info.isFile()) await rm(candidate, { force: true })
}

const clearDirectoryChildren = async (rootReal: string, directory: string): Promise<void> => {
  let info
  try {
    info = await lstat(directory)
  } catch (error) {
    if (isMissing(error)) return
    throw error
  }
  if (info.isSymbolicLink()) {
    await rm(directory, { force: true })
    return
  }
  if (!info.isDirectory()) return
  const directoryReal = await realpath(directory)
  assertInsideRoot(rootReal, directoryReal)
  const entries = await readdir(directory)
  await Promise.all(entries.map((name) => removeTrusted(rootReal, join(directory, name))))
}

// Imported copies live in notebook-inputs and in each session working folder's data tree.
// Notebook caches and harvested analysis intermediates are the cache and hpc directories.
// run.json, conversations, and files outside the data root are left in place.
const clearSessionWorkspace = async (rootReal: string, workspace: string): Promise<void> => {
  await clearDirectoryChildren(rootReal, join(workspace, 'data'))
  await removeTrusted(rootReal, join(workspace, 'cache'))
  await removeTrusted(rootReal, join(workspace, 'hpc'))
  const framesRoot = join(workspace, 'frames')
  let frames
  try {
    frames = await readdir(framesRoot, { withFileTypes: true })
  } catch (error) {
    if (isMissing(error)) return
    throw error
  }
  for (const frame of frames) {
    if (!frame.isDirectory() || frame.isSymbolicLink() || !SAFE_SEGMENT.test(frame.name)) continue
    await clearSessionWorkspace(rootReal, join(framesRoot, frame.name))
  }
}

export const deleteDevicePatientData = async (
  storageRoot: string,
  projectId: string
): Promise<void> => {
  if (!SAFE_SEGMENT.test(projectId)) throw new Error('Invalid project id.')
  const rootReal = await realpath(storageRoot)
  await removeTrusted(rootReal, join(storageRoot, NOTEBOOK_INPUTS_DIR, projectId))
  const projectRoot = join(storageRoot, NOTEBOOKS_DIR, projectId)
  let sessions
  try {
    sessions = await readdir(projectRoot, { withFileTypes: true })
  } catch (error) {
    if (isMissing(error)) return
    throw error
  }
  for (const session of sessions) {
    if (!session.isDirectory() || session.isSymbolicLink() || !SAFE_SEGMENT.test(session.name)) {
      continue
    }
    await clearSessionWorkspace(rootReal, join(projectRoot, session.name))
  }
}
