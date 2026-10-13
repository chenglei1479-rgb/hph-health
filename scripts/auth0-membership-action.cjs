// Deploy as an Auth0 Post Login Action; attach only after testing with the intended Native app.
// Administrator-owned app_metadata only. Never trust user_metadata or client-side plan selection.
exports.onExecutePostLogin = async (event, api) => {
  if (event.client.client_id !== 'Rh2MZp3aNDrmGLuI3VHsnNI1mG4SPUqf') return
  const namespace = 'https://github.com/chenglei1479-rgb/hph-health/membership'
  const grant = event.user.app_metadata?.dra_membership
  const validUntil = typeof grant?.valid_until === 'string' ? Date.parse(grant.valid_until) : NaN
  const validGrant =
    grant?.status === 'active' &&
    ['plus', 'pro'].includes(grant?.plan) &&
    Number.isSafeInteger(validUntil) &&
    validUntil > 0
  api.idToken.setCustomClaim(
    namespace,
    // Preserve a signed past deadline so the desktop can show "expired", while its admission
    // checks downgrade to Free at that deadline. This never extends an entitlement.
    validGrant
      ? { plan: grant.plan, status: 'active', validUntil }
      : { plan: 'free', status: 'free' }
  )
}
