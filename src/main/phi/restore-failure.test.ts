import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { flushLogs, initLogger } from '@aipoch/diagnostics/node'

import { PHI_INTERNAL_CODE, PHI_UNAVAILABLE_CODE, PhiPolicyError } from '../../shared/phi-block'
import {
  PHI_INTERNAL_MESSAGE,
  createVaultBackedGate,
  installPhiGate,
  restoreModelText
} from './gate'
import { phiErrorResponse } from '../settings/provider-loopback-http-host'

// Shaped like a real filesystem error: the first use of a project writes <userData>/phi/vault.bin, and
// a writeFileSync EACCES or ENOSPC message carries that absolute path.
const MARKER = 'C:\\Users\\someone\\AppData\\Roaming\\dra\\phi\\vault.bin'
const pathError = () => new Error(`EACCES: permission denied, open '${MARKER}'`)

const installThrowingGate = (error: () => unknown) => {
  installPhiGate({
    release: () => {
      throw error()
    },
    restore: () => {
      throw error()
    }
  })
}

const captureFailure = (): unknown => {
  try {
    return restoreModelText('released text', 'project-1')
  } catch (error) {
    return error
  }
}

let logDir: string

beforeEach(async () => {
  logDir = await mkdtemp(join(tmpdir(), 'phi-restore-log-'))
  initLogger({ logDir, mirrorToConsole: false })
})

afterEach(async () => {
  installPhiGate(null)
  await flushLogs()
  await rm(logDir, { recursive: true, force: true })
})

const writtenLog = async () => {
  await flushLogs()
  try {
    return await readFile(join(logDir, 'main.log'), 'utf8')
  } catch (error) {
    // No record was written at all, which is a valid outcome for the success case.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''
    throw error
  }
}

describe('restoreModelText failure surface', () => {
  it('keeps the vault path out of the body and puts it in the log with a stable code', async () => {
    installThrowingGate(pathError)

    const thrown = captureFailure() as Error & { code?: string }

    expect(thrown.message).toBe(PHI_INTERNAL_MESSAGE)
    expect(thrown.message).not.toContain('vault.bin')
    expect(thrown.message).not.toContain('C:\\Users')
    expect(thrown.message).not.toContain('someone')
    expect(thrown.code).toBe(PHI_INTERNAL_CODE)

    // Not discarded, only moved: the production logger receives the original message and the code.
    const log = await writtenLog()
    expect(log).toContain('phi restore failed')
    expect(log).toContain('vault.bin')
    expect(log).toContain(PHI_INTERNAL_CODE)
  })

  it('preserves the store class so an unavailable vault stays retryable', async () => {
    installThrowingGate(
      () => new PhiPolicyError(`vault at ${MARKER} is locked`, PHI_UNAVAILABLE_CODE)
    )

    const thrown = captureFailure() as Error & { code?: string }

    expect(thrown.code).toBe(PHI_UNAVAILABLE_CODE)
    expect(thrown.message).toBe(PHI_INTERNAL_MESSAGE)
    expect(await writtenLog()).toContain('vault.bin')
  })

  it('covers the real vault-backed gate, not only a hand-written stub', async () => {
    installPhiGate(
      createVaultBackedGate({
        store() {
          throw pathError()
        }
      })
    )

    const thrown = captureFailure() as Error & { code?: string }

    expect(thrown.message).toBe(PHI_INTERNAL_MESSAGE)
    expect(thrown.message).not.toContain('vault.bin')
    expect(await writtenLog()).toContain('vault.bin')
  })

  it('does not swallow the failure: the restored text is still refused', () => {
    installThrowingGate(pathError)
    expect(() => restoreModelText('released text', 'project-1')).toThrow()
  })

  // The review's point: the leaked thing is the outbound body, so assert the body itself rather than
  // only the thrown message. This goes through the transport mapping the client actually receives.
  it.each([
    [PHI_INTERNAL_CODE, 409],
    [PHI_UNAVAILABLE_CODE, 503]
  ])('%s reaches the wire as %i with a body that carries no vault path', (code, status) => {
    installThrowingGate(() => new PhiPolicyError(`vault at ${MARKER} is locked`, code))
    const response = phiErrorResponse(captureFailure(), 'fallback')
    expect(response.status).toBe(status)
    const body = JSON.stringify(response.body)
    expect(body).not.toContain('vault.bin')
    expect(body).not.toContain('C:\\Users')
    expect(body).not.toContain('someone')
  })

  it('still restores normally when the gate succeeds', async () => {
    installPhiGate({
      release: () => ({ text: '', warnings: [] }),
      restore: (text) => text.replace('[NAME1]', '山田 太郎')
    })
    expect(restoreModelText('[NAME1]', 'project-1')).toBe('山田 太郎')
    // A successful restore logs nothing about a failure.
    expect(await writtenLog()).not.toContain('phi restore failed')
  })
})
