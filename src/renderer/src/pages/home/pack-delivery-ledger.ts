import { useSyncExternalStore } from 'react'

import { isDeliveryPackId, type DeliveryPackId } from '../../../../shared/deliverable-next-step'

// On-device trial log. Doctors copy the numbers themselves.
// This module never calls the network, and nothing reads it for upload.

const STORAGE_KEY = 'dra-pack-delivery-ledger-v1'
const MAX_RECORDED_KEYS = 1000

export type PackDeliveryLedger = {
  version: 1
  totalCompleted: number
  byPack: Partial<Record<DeliveryPackId, number>>
  recordedKeys: string[]
  lastCompletionId: DeliveryPackId | null
  homeCardDismissed: boolean
}

const emptyLedger = (): PackDeliveryLedger => ({
  version: 1,
  totalCompleted: 0,
  byPack: {},
  recordedKeys: [],
  lastCompletionId: null,
  homeCardDismissed: false
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const readStored = (): PackDeliveryLedger => {
  try {
    if (typeof localStorage === 'undefined') return emptyLedger()
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyLedger()
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || parsed.version !== 1) return emptyLedger()
    const byPack: PackDeliveryLedger['byPack'] = {}
    if (isRecord(parsed.byPack)) {
      for (const [id, count] of Object.entries(parsed.byPack)) {
        if (isDeliveryPackId(id) && typeof count === 'number' && count >= 0) byPack[id] = count
      }
    }
    const recordedKeys = Array.isArray(parsed.recordedKeys)
      ? parsed.recordedKeys.filter((key): key is string => typeof key === 'string')
      : []
    const last = parsed.lastCompletionId
    return {
      version: 1,
      totalCompleted:
        typeof parsed.totalCompleted === 'number' && parsed.totalCompleted >= 0
          ? parsed.totalCompleted
          : 0,
      byPack,
      recordedKeys,
      lastCompletionId: typeof last === 'string' && isDeliveryPackId(last) ? last : null,
      homeCardDismissed: parsed.homeCardDismissed === true
    }
  } catch {
    return emptyLedger()
  }
}

let state = readStored()
const listeners = new Set<() => void>()

const persist = (next: PackDeliveryLedger): void => {
  state = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // The count still updates for this session when storage is blocked.
  }
  for (const listener of listeners) listener()
}

export const getPackDeliveryLedger = (): PackDeliveryLedger => state

export const subscribePackDeliveryLedger = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const usePackDeliveryLedger = (): PackDeliveryLedger =>
  useSyncExternalStore(subscribePackDeliveryLedger, getPackDeliveryLedger, getPackDeliveryLedger)

export const recordPackDelivery = (id: DeliveryPackId, dedupeKey: string): PackDeliveryLedger => {
  if (state.recordedKeys.includes(dedupeKey)) return state
  const recordedKeys = [...state.recordedKeys, dedupeKey].slice(-MAX_RECORDED_KEYS)
  const next: PackDeliveryLedger = {
    version: 1,
    totalCompleted: state.totalCompleted + 1,
    byPack: { ...state.byPack, [id]: (state.byPack[id] ?? 0) + 1 },
    recordedKeys,
    lastCompletionId: id,
    homeCardDismissed: false
  }
  persist(next)
  return next
}

export const dismissPackDeliveryHomeCard = (): void => {
  if (state.homeCardDismissed) return
  persist({ ...state, homeCardDismissed: true })
}

export const resetPackDeliveryLedgerForTests = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
  state = emptyLedger()
  for (const listener of listeners) listener()
}

export { STORAGE_KEY as PACK_DELIVERY_LEDGER_KEY }
