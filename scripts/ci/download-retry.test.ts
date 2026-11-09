/* eslint-disable @typescript-eslint/explicit-function-return-type */

import { describe, expect, it, vi } from 'vitest'

import {
  DOWNLOAD_BASE_DELAY_MS,
  DOWNLOAD_MAX_DELAY_MS,
  DOWNLOAD_MAX_ATTEMPTS,
  DownloadFailure,
  ciAnnotationLine,
  failureSummary,
  fetchBytesWithRetry,
  reportDownloadFailure,
  retryDecision,
  retryDelayMs,
  retryLogLine,
  withDownloadStage
} from './download-retry.mjs'

const okResponse = (body = 'archive-bytes') => ({
  ok: true,
  status: 200,
  arrayBuffer: async () => new TextEncoder().encode(body).buffer
})

const failedResponse = (status = 502) => ({
  ok: false,
  status,
  arrayBuffer: async () => new ArrayBuffer(0)
})

describe('download retry policy', () => {
  it('stops after the configured number of attempts', () => {
    expect(retryDecision({ attempt: 1, maxAttempts: 3 })).toEqual({
      retry: true,
      delayMs: DOWNLOAD_BASE_DELAY_MS,
      reason: 'transport-retry'
    })
    expect(retryDecision({ attempt: 2, maxAttempts: 3 })).toEqual({
      retry: true,
      delayMs: 2 * DOWNLOAD_BASE_DELAY_MS,
      reason: 'transport-retry'
    })
    expect(retryDecision({ attempt: 3, maxAttempts: 3 })).toEqual({
      retry: false,
      delayMs: 0,
      reason: 'attempts-exhausted'
    })
    // the default budget is the one the callers use
    expect(DOWNLOAD_MAX_ATTEMPTS).toBe(3)
    expect(retryDecision({ attempt: 1 })).toMatchObject({ retry: true })
    expect(retryDecision({ attempt: DOWNLOAD_MAX_ATTEMPTS })).toMatchObject({ retry: false })
  })

  it('keeps the backoff inside its bounds', () => {
    expect(retryDelayMs(1)).toBe(DOWNLOAD_BASE_DELAY_MS)
    expect(retryDelayMs(2)).toBe(4_000)
    expect(retryDelayMs(3)).toBe(8_000)
    // exponential growth is capped, so one step cannot stall the job
    expect(retryDelayMs(10)).toBe(DOWNLOAD_MAX_DELAY_MS)
    expect(retryDelayMs(10, { baseDelayMs: 100, maxDelayMs: 250 })).toBe(250)
    expect(retryDelayMs(1, { baseDelayMs: 100, maxDelayMs: 250 })).toBe(100)
    expect(() => retryDelayMs(0)).toThrow(/positive integer/)
  })

  it('never retries a digest mismatch or an extract failure', () => {
    // A second download that produces a different digest means the pin is wrong; retrying would
    // hide that. The extract stage already has the bytes, so a retry cannot change the outcome.
    expect(retryDecision({ kind: 'digest', attempt: 1, maxAttempts: 3 })).toEqual({
      retry: false,
      delayMs: 0,
      reason: 'digest-is-final'
    })
    expect(retryDecision({ kind: 'extract', attempt: 1, maxAttempts: 3 })).toEqual({
      retry: false,
      delayMs: 0,
      reason: 'extract-is-final'
    })
    expect(() => retryDecision({ kind: 'network', attempt: 1 })).toThrow(
      /unknown download failure kind/
    )
  })

  it('names the failure class, the total attempts and a stable id', () => {
    expect(
      retryLogLine({
        code: 'SCHEMA-PY-RETRY-01',
        attempt: 2,
        maxAttempts: 3,
        url: 'https://x/y.tgz'
      })
    ).toBe('SCHEMA-PY-RETRY-01 attempt=2/3 url=https://x/y.tgz')
    expect(failureSummary({ kind: 'download', attempts: 3 })).toBe('download attempts=3')
    expect(
      ciAnnotationLine({
        title: 'schema-notebook python download failed',
        kind: 'digest',
        attempts: 1,
        url: 'https://x/y.tgz'
      })
    ).toBe(
      '::error title=schema-notebook python download failed::digest attempts=1 url=https://x/y.tgz'
    )
    expect(() => ciAnnotationLine({})).toThrow(/title is required/)
  })
})

describe('fetchBytesWithRetry', () => {
  it('does not log a retry line when the first attempt succeeds', async () => {
    const fetchImpl = vi.fn(async () => okResponse('first-try'))
    const log = vi.fn()

    const bytes = await fetchBytesWithRetry({
      url: 'https://example.test/a.tgz',
      id: 'SCHEMA-PY',
      fetchImpl,
      log
    })

    expect(bytes.toString()).toBe('first-try')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(log).not.toHaveBeenCalled()
  })

  it('retries a transport failure, logs the stable id, and succeeds - the retry is not swallowed', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(okResponse('second-try'))
    const log = vi.fn()
    const sleep = vi.fn()

    const bytes = await fetchBytesWithRetry({
      url: 'https://example.test/a.tgz',
      id: 'SCHEMA-PY',
      fetchImpl,
      log,
      sleep
    })

    expect(bytes.toString()).toBe('second-try')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledWith(DOWNLOAD_BASE_DELAY_MS)
    // printed even though the step ultimately succeeded
    expect(log.mock.calls.map(([line]): string => line)).toEqual([
      'SCHEMA-PY-RETRY-01 attempt=2/3 url=https://example.test/a.tgz'
    ])
  })

  it('reports `download attempts=3` and one annotation when the budget is spent', async () => {
    const fetchImpl = vi.fn(async () => failedResponse(503))
    const log = vi.fn()
    const sleep = vi.fn()

    await expect(
      fetchBytesWithRetry({
        url: 'https://example.test/a.tgz',
        id: 'MICROMAMBA',
        fetchImpl,
        log,
        sleep
      })
    ).rejects.toMatchObject({ name: 'DownloadFailure', kind: 'download', attempts: 3 })

    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
    expect(log.mock.calls.map(([line]): string => line)).toEqual([
      'MICROMAMBA-RETRY-01 attempt=2/3 url=https://example.test/a.tgz',
      'MICROMAMBA-RETRY-01 attempt=3/3 url=https://example.test/a.tgz'
    ])

    let thrown
    try {
      await fetchBytesWithRetry({
        url: 'https://example.test/a.tgz',
        id: 'MICROMAMBA',
        fetchImpl,
        log,
        sleep
      })
    } catch (error) {
      thrown = error
    }
    expect(thrown.message).toContain('download attempts=3')

    const annotation = reportDownloadFailure(thrown, {
      title: 'micromamba download failed',
      log: () => {}
    })
    expect(annotation).toBe(
      '::error title=micromamba download failed::download attempts=3 url=https://example.test/a.tgz'
    )
  })

  it('honours a smaller attempt budget', async () => {
    const fetchImpl = vi.fn(async () => failedResponse(500))
    const sleep = vi.fn()

    await expect(
      fetchBytesWithRetry({
        url: 'https://example.test/a.tgz',
        id: 'MICROMAMBA',
        fetchImpl,
        log: () => {},
        sleep,
        maxAttempts: 2
      })
    ).rejects.toMatchObject({ kind: 'download', attempts: 2 })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledTimes(1)
  })
})

describe('the staging script uses the shared policy', () => {
  it('classifies a wrong digest as digest and does not download a second time', async () => {
    const { mkdtempSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { stageSchemaNotebookPython } = await import('../stage-schema-notebook-python.mjs')
    const root = mkdtempSync(join(tmpdir(), 'schema-python-'))
    const fetchImpl = vi.fn(async () => okResponse('not the pinned archive'))

    await expect(
      stageSchemaNotebookPython({ platform: 'win', arch: 'x64', root, fetchImpl })
    ).rejects.toMatchObject({ kind: 'digest' })

    // The point of the classification: a second download would produce the same wrong bytes.
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})

describe('failure classification', () => {
  it('keeps a digest failure final and carries the expected and actual digest', () => {
    const failure = new DownloadFailure('digest', 'digest mismatch: expected aa, got bb', {
      url: 'https://example.test/a.tgz'
    })
    expect(failure.kind).toBe('digest')
    expect(failure.attempts).toBe(1)
    expect(retryDecision({ kind: failure.kind, attempt: 1, maxAttempts: 3 })).toMatchObject({
      retry: false
    })
  })

  it('classifies a post-download stage failure as extract without retrying', async () => {
    await expect(
      withDownloadStage('extract', async () => {
        throw new Error('tar exited with 2')
      })
    ).rejects.toMatchObject({ kind: 'extract', attempts: 1 })

    expect(retryDecision({ kind: 'extract', attempt: 1, maxAttempts: 3 })).toMatchObject({
      retry: false
    })
  })

  it('passes an already classified failure through unchanged', async () => {
    const original = new DownloadFailure('digest', 'pinned digest missing')
    await expect(
      withDownloadStage('extract', async () => {
        throw original
      })
    ).rejects.toBe(original)
  })

  it('ignores a non-download error when reporting', () => {
    expect(reportDownloadFailure(new Error('boom'), { title: 'x', log: () => {} })).toBeUndefined()
  })
})
