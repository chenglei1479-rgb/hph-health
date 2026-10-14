import { describe, expect, it } from 'vitest'

import {
  UPDATE_SIGNATURE_REJECTED,
  type DraSigningConfig
} from '../../shared/signed-update-channel'
import {
  collectSignatureEvidence,
  verifyDownloadedArtifact,
  type SignatureCommand,
  type SignatureCommandRunner
} from './signature-gate'

const config = (): DraSigningConfig => ({
  updateFeedUrl: 'https://updates.dra.example/dra/',
  macTeamId: 'TEAMID1234',
  windowsPublisherName: 'DRA KK',
  requireNotarization: true,
  requestedChannel: 'stable'
})

const scripted = (
  responses: Record<string, { status?: number; stdout?: string; stderr?: string }>
): { calls: SignatureCommand[]; run: SignatureCommandRunner } => {
  const calls: SignatureCommand[] = []
  return {
    calls,
    run: (command: SignatureCommand) => {
      calls.push(command)
      const response = responses[command.command] ?? { status: 1, stdout: '', stderr: '' }
      return {
        status: response.status ?? 0,
        stdout: response.stdout ?? '',
        stderr: response.stderr ?? ''
      }
    }
  }
}

describe('signature gate', () => {
  it('reads the macOS team id and notarization ticket without trusting the file name', () => {
    const runner = scripted({
      '/usr/bin/codesign': { stderr: 'Identifier=com.dra.app\nTeamIdentifier=TEAMID1234\n' },
      '/usr/sbin/spctl': { status: 0, stderr: 'source=Notarized Developer ID\n' }
    })
    expect(collectSignatureEvidence('darwin', '/tmp/DRA.app', runner.run)).toMatchObject({
      platform: 'darwin',
      teamId: 'TEAMID1234',
      notarized: true
    })
    expect(runner.calls[0]?.args).toContain('/tmp/DRA.app')
    expect(verifyDownloadedArtifact('/tmp/DRA.app', config(), 'darwin', runner.run)).toEqual({
      ok: true
    })
  })

  it('pins the Windows Authenticode publisher from the certificate subject', () => {
    const runner = scripted({
      'powershell.exe': {
        stdout: 'Valid\nCN=DRA KK, O=DRA KK, C=JP\n'
      }
    })
    const verdict = verifyDownloadedArtifact(
      'C:\\Users\\Dra\\Downloads\\DRA-setup.exe',
      config(),
      'win32',
      runner.run
    )
    expect(verdict).toEqual({ ok: true })
    expect(runner.calls[0]?.env?.DRA_UPDATE_ARTIFACT).toBe(
      'C:\\Users\\Dra\\Downloads\\DRA-setup.exe'
    )
    expect(runner.calls[0]?.args.join(' ')).not.toContain('DRA-setup.exe')
  })

  it('refuses a missing artifact and a path that could break the verifier command', () => {
    const runner = scripted({})
    expect(verifyDownloadedArtifact(undefined, config(), 'darwin', runner.run)).toEqual({
      ok: false,
      reason: UPDATE_SIGNATURE_REJECTED
    })
    expect(verifyDownloadedArtifact('/tmp/evil\n.app', config(), 'darwin', runner.run)).toEqual({
      ok: false,
      reason: UPDATE_SIGNATURE_REJECTED
    })
    expect(runner.calls).toHaveLength(0)
  })
})
