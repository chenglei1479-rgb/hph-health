import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ipcMain } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { configureIpcHandlerRegistry } from '../ipc-handler-registry'

const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>()

vi.mock('electron', () => ({
  app: { getPath: () => '/unused' },
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, payload: unknown) => unknown) => {
      handlers.set(channel, handler)
    }
  }
}))

configureIpcHandlerRegistry(ipcMain)

const { createMachineApprovalCommandOwner, registerMachineApprovalIpcHandlers } =
  await import('./approval-ipc')
const { createMachineApprovalLog } = await import('./approval')

const logFile = (): string =>
  join(mkdtempSync(join(tmpdir(), 'phi-approval-ui-')), 'machine-approval.jsonl')

describe('machine approval settings', () => {
  beforeEach(() => {
    handlers.clear()
  })

  it('appends an approval and a later revocation without rewriting earlier lines', async () => {
    const path = logFile()
    const owner = createMachineApprovalCommandOwner(path)
    expect(await owner.getStatus()).toEqual({ approved: false, approvalNumber: null, at: null })

    const approved = await owner.setStatus({ approved: true, approvalNumber: ' HP-2026-014 ' })
    expect(approved.approved).toBe(true)
    expect(approved.approvalNumber).toBe('HP-2026-014')
    expect(approved.at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    const before = readFileSync(path)

    const revoked = await owner.setStatus({ approved: false })
    expect(revoked).toMatchObject({ approved: false, approvalNumber: null })
    const after = readFileSync(path)
    expect(after.subarray(0, before.length).equals(before)).toBe(true)
    expect(after.toString('utf8').trim().split('\n')).toHaveLength(2)
    expect(await owner.getStatus()).toEqual({
      approved: false,
      approvalNumber: null,
      at: revoked.at
    })
  })

  it('lets the gate reread a later approval or revocation from the same log', async () => {
    const path = logFile()
    const gateLog = createMachineApprovalLog(path)
    const owner = createMachineApprovalCommandOwner(path)
    expect(gateLog.isApproved()).toBe(false)

    await owner.setStatus({ approved: true, approvalNumber: 'HP-2026-014' })
    expect(gateLog.isApproved()).toBe(true)

    await owner.setStatus({ approved: false })
    expect(gateLog.isApproved()).toBe(false)
  })

  it('refuses a blank approval number and leaves the log untouched', async () => {
    const path = logFile()
    const owner = createMachineApprovalCommandOwner(path)
    await expect(owner.setStatus({ approved: true, approvalNumber: '   ' })).rejects.toThrow(
      /approval number/
    )
    expect(await owner.getStatus()).toEqual({ approved: false, approvalNumber: null, at: null })
  })

  it('delegates the settings channels to the owner', async () => {
    const owner = {
      getStatus: vi.fn(async () => ({ approved: false, approvalNumber: null, at: null })),
      setStatus: vi.fn(async () => ({
        approved: true,
        approvalNumber: 'HP-14',
        at: '2026-10-14T03:27:00.000Z'
      }))
    }
    registerMachineApprovalIpcHandlers(owner)
    await handlers.get('machine-approval:get-status')!(undefined, undefined)
    await handlers.get('machine-approval:set-status')!(undefined, {
      approved: true,
      approvalNumber: 'HP-14'
    })
    expect(owner.getStatus).toHaveBeenCalledOnce()
    expect(owner.setStatus).toHaveBeenCalledWith({ approved: true, approvalNumber: 'HP-14' })
  })
})
