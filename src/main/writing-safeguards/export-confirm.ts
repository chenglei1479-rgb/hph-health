import {
  inspectExportFile,
  type ExportFinding
} from '../../shared/writing-safeguards/export-deidentify'

export const confirmDeidentifiedExports = async (
  files: readonly { name: string; text: string }[],
  ask: (findings: readonly ExportFinding[]) => Promise<boolean>
): Promise<boolean> => {
  const findings = files.flatMap((file) => inspectExportFile(file))
  if (findings.length === 0) return true
  return ask(findings)
}
