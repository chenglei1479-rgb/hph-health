import type { ProviderType } from '../../shared/settings'
import { isClaudeSubscriptionProvider, isCodexSubscriptionProvider } from '../../shared/settings'
import { modelReleaseError, UNGUARDED_AGENT_MESSAGE } from './gate'

/** Native subscription admission requires the credential-free, app-owned HTTP route.
 * A bare discriminator never authorizes starting an independently authenticated CLI.
 */
export function assertPhiCheckedAgentProvider(
  type: ProviderType,
  boundary?: 'codex-subscription-bridge'
): void {
  if (
    isClaudeSubscriptionProvider(type) ||
    (isCodexSubscriptionProvider(type) && boundary !== 'codex-subscription-bridge')
  ) {
    throw modelReleaseError(UNGUARDED_AGENT_MESSAGE)
  }
}
