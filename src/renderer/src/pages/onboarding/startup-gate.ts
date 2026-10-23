// Pure startup decision. First-time setup is an explicit flow even when the machine already satisfies
// every dependency; completed users always enter the app while launch checks continue invisibly in
// the background. They see the repair surface only after choosing the Home alert.
//
// The beta terms gate is separate from onboarding: an install that finished onboarding before the
// terms existed (or under an older terms version) acknowledges the current version once on a
// lightweight page instead of rerunning the wizard.

export type StartupView = 'onboarding' | 'beta-terms' | 'app'

export type StartupGateInput = {
  onboardingDone: boolean
  betaTermsAccepted?: boolean
}

export const resolveStartupView = (input: StartupGateInput): StartupView => {
  if (!input.onboardingDone) return 'onboarding'
  return input.betaTermsAccepted ? 'app' : 'beta-terms'
}
