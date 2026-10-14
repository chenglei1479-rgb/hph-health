import type { MembershipState } from './membership'

export type AccountLoginMethod = 'email' | 'google' | 'microsoft' | 'apple' | 'institution'
export type AccountConsentNotice = {
  version: string
  title: string
  body: string
  acknowledgement: string
}
export type AccountLoginRequest = {
  method: AccountLoginMethod
  signup?: boolean
  consentAccepted?: boolean
}
export type NotebookAccessCheck = {
  checkedAt: number
  state: AccountState
  foreground: { allowed: boolean; error?: string }
  background: { allowed: boolean; error?: string }
}
export type AccountState = {
  configured: boolean
  required: boolean
  pending: boolean
  methods: AccountLoginMethod[]
  profile?: string
  user?: { subject: string; email?: string; name?: string }
  expiresAt?: number
  membership?: MembershipState
  error?: 'configuration' | 'consent' | 'login' | 'timeout' | 'email-unverified' | 'different-owner'
  consent?: { required: boolean; notice?: AccountConsentNotice; acceptedAt?: string }
}
