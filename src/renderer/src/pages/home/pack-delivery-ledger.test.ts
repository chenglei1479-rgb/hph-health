// @vitest-environment jsdom

import { readFileSync } from 'node:fs'

import { afterEach, expect, it } from 'vitest'

import {
  PACK_DELIVERY_LEDGER_KEY,
  getPackDeliveryLedger,
  recordPackDelivery,
  resetPackDeliveryLedgerForTests
} from './pack-delivery-ledger'

afterEach(() => {
  resetPackDeliveryLedgerForTests()
})

it('counts each delivery once and keeps the ledger on this device', () => {
  recordPackDelivery('consultation-pack', 'session:one')
  recordPackDelivery('consultation-pack', 'session:one')
  recordPackDelivery('analysis', 'session:two')
  const ledger = getPackDeliveryLedger()
  expect(ledger.totalCompleted).toBe(2)
  expect(ledger.byPack).toEqual({ 'consultation-pack': 1, analysis: 1 })
  expect(ledger.lastCompletionId).toBe('analysis')
  const stored = JSON.parse(localStorage.getItem(PACK_DELIVERY_LEDGER_KEY) ?? '{}') as {
    totalCompleted: number
  }
  expect(stored.totalCompleted).toBe(2)
  const source = readFileSync('src/renderer/src/pages/home/pack-delivery-ledger.ts', 'utf8')
  expect(source).not.toMatch(/fetch\(|XMLHttpRequest|sendBeacon|telemetry|analytics/)
  expect(source).not.toMatch(/https?:\/\//)
})
