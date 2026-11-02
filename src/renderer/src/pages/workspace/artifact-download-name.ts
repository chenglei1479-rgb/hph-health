import { getFileExtension } from './preview-support'

// One place decides the save-dialog filename for a generated file, so the message card, the project
// file row, and the details panel cannot drift apart. Version 2 and later keep the original extension
// and append the version, which is the #122 download contract; version 1 keeps the plain name so the
// default download of the current file never gains a suffix users did not ask for.
export const versionedArtifactDownloadName = (name: string, versionNumber?: number): string => {
  const trimmed = name.trim()
  if (!trimmed) return name
  if (!versionNumber || versionNumber < 2) return trimmed

  const suffix = `-v${versionNumber}`
  const extension = getFileExtension(trimmed)
  if (!extension) return `${trimmed}${suffix}`

  const stem = trimmed.slice(0, trimmed.length - extension.length - 1)
  // A dotfile (".env") has no stem to keep apart from the extension; suffix the whole name instead.
  return stem ? `${stem}${suffix}.${extension}` : `${trimmed}${suffix}`
}
