import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { traceDatabaseClientStartup } from './database-client-startup-trace'

it('persists entry before verification settles and records the returned client and elapsed time', async () => {
  const root = mkdtempSync(join(tmpdir(), 'db-client-trace-'))
  try {
    let clock = 10
    let resolve!: (value: object) => void
    const pending = new Promise<object>((done) => {
      resolve = done
    })
    const run = traceDatabaseClientStartup(
      root,
      () => pending,
      () => clock
    )
    const read = (): Array<{ event: string; elapsedMs: number }> =>
      readFileSync(join(root, 'database-startup-trace.log'), 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
    expect(read()).toMatchObject([{ event: 'begin', elapsedMs: 0 }])
    clock = 45
    const client = { client: true }
    resolve(client)
    expect(await run).toBe(client)
    expect(read()).toMatchObject([{ event: 'begin' }, { event: 'completed', elapsedMs: 35 }])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

it('rethrows the exact verification failure and records failure rather than completion', async () => {
  const root = mkdtempSync(join(tmpdir(), 'db-client-trace-'))
  try {
    const failure = new Error('database rejected')
    await expect(
      traceDatabaseClientStartup(root, async () => {
        throw failure
      })
    ).rejects.toBe(failure)
    const text = readFileSync(join(root, 'database-startup-trace.log'), 'utf8')
    expect(text).toContain('"event":"failed"')
    expect(text).not.toContain('"event":"completed"')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

it('does not change verification success or failure when trace storage is unavailable', async () => {
  const root = mkdtempSync(join(tmpdir(), 'db-trace-unwritable-'))
  try {
    const blocked = join(root, 'file-not-directory')
    writeFileSync(blocked, 'occupied')
    const client = { verified: true }
    expect(await traceDatabaseClientStartup(blocked, async () => client)).toBe(client)
    const failure = new Error('database must still fail')
    await expect(
      traceDatabaseClientStartup(blocked, async () => {
        throw failure
      })
    ).rejects.toBe(failure)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
