import { describe, expect, it } from 'vitest'

import { resolveStartupView, type StartupGateInput } from './startup-gate'

const input = (patch: Partial<StartupGateInput> = {}): StartupGateInput => ({
  onboardingDone: false,
  betaTermsAccepted: false,
  ...patch
})

describe('resolveStartupView', () => {
  it('always shows onboarding until the first-run flow is explicitly completed', () => {
    expect(resolveStartupView(input())).toBe('onboarding')
    expect(resolveStartupView(input({ betaTermsAccepted: true }))).toBe('onboarding')
  })

  it('shows the beta terms gate for completed users without a current acceptance', () => {
    expect(resolveStartupView(input({ onboardingDone: true }))).toBe('beta-terms')
    expect(resolveStartupView(input({ onboardingDone: true, betaTermsAccepted: false }))).toBe(
      'beta-terms'
    )
  })

  it('opens the app for completed users who accepted the current terms', () => {
    expect(resolveStartupView(input({ onboardingDone: true, betaTermsAccepted: true }))).toBe('app')
  })
})
