import type { ProviderType } from '../../shared/settings'
import { isClaudeSubscriptionProvider, isCodexSubscriptionProvider } from '../../shared/settings'
import { modelReleaseError, UNGUARDED_AGENT_MESSAGE } from './gate'

/** Subscription CLIs own their network and file/tool reads. ACP prompt checking cannot
 * cover their subsequent requests. Refuse before preparing homes, starting processes,
 * loading conversation history or provisioning tools. xAI OAuth uses the checked bridge.
 */
export function assertPhiCheckedAgentProvider(type: ProviderType): void {
  if (isClaudeSubscriptionProvider(type) || isCodexSubscriptionProvider(type)) {
    throw modelReleaseError(UNGUARDED_AGENT_MESSAGE)
  }
}
