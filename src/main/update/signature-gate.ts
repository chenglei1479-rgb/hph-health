import { spawnSync } from 'node:child_process'

import {
  signatureSatisfiesPolicy,
  UPDATE_SIGNATURE_REJECTED,
  type DraSigningConfig,
  type SignatureEvidence
} from '../../shared/signed-update-channel'

export type SignatureCommand = {
  command: string
  args: string[]
  env?: Record<string, string>
}

export type SignatureCommandResult = {
  status: number | null
  stdout: string
  stderr: string
}

export type SignatureCommandRunner = (command: SignatureCommand) => SignatureCommandResult

const ARTIFACT_ENV = 'DRA_UPDATE_ARTIFACT'

export const productionCommandRunner: SignatureCommandRunner = (command) => {
  const result = spawnSync(command.command, command.args, {
    encoding: 'utf8',
    env: { ...process.env, ...command.env },
    windowsHide: true
  })
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? ''
  }
}

const rejectUnsafePath = (artifactPath: string): void => {
  if (!artifactPath.trim() || /[\r\n\0]/.test(artifactPath)) {
    throw new Error('Update artifact path is not safe to verify.')
  }
}

export const collectSignatureEvidence = (
  platform: NodeJS.Platform,
  artifactPath: string,
  run: SignatureCommandRunner
): SignatureEvidence => {
  rejectUnsafePath(artifactPath)
  if (platform === 'darwin') {
    const codesign = run({
      command: '/usr/bin/codesign',
      args: ['-dv', '--verbose=4', artifactPath]
    })
    const details = `${codesign.stdout}\n${codesign.stderr}`
    const teamId = /^TeamIdentifier=(.+)$/m.exec(details)?.[1]?.trim()
    const spctl = run({
      command: '/usr/sbin/spctl',
      args: ['--assess', '--verbose', '--type', 'execute', artifactPath]
    })
    const assessment = `${spctl.stdout}\n${spctl.stderr}`
    const notarized = /notarized/i.test(assessment) && spctl.status === 0
    return { platform: 'darwin', ...(teamId ? { teamId } : {}), notarized }
  }
  if (platform === 'win32') {
    const result = run({
      command: 'powershell.exe',
      args: [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '$signature = Get-AuthenticodeSignature -LiteralPath $env:DRA_UPDATE_ARTIFACT; Write-Output $signature.Status; if ($signature.SignerCertificate) { Write-Output $signature.SignerCertificate.Subject }'
      ],
      env: { [ARTIFACT_ENV]: artifactPath }
    })
    const [status, ...subjectLines] = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
    return {
      platform: 'win32',
      ...(status ? { signatureStatus: status } : {}),
      ...(subjectLines.length > 0 ? { publisherName: subjectLines.join(', ') } : {})
    }
  }
  if (platform === 'linux') return { platform: 'linux' }
  return { platform: 'other' }
}

export const verifyDownloadedArtifact = (
  artifactPath: string | undefined,
  config: DraSigningConfig,
  platform: NodeJS.Platform = process.platform,
  run: SignatureCommandRunner = productionCommandRunner
): { ok: true } | { ok: false; reason: string } => {
  if (!artifactPath) return { ok: false, reason: UPDATE_SIGNATURE_REJECTED }
  try {
    return signatureSatisfiesPolicy(collectSignatureEvidence(platform, artifactPath, run), config)
  } catch {
    return { ok: false, reason: UPDATE_SIGNATURE_REJECTED }
  }
}
