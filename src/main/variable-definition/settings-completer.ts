import { VARIABLE_DEFINITION_MISSING_KEY_MESSAGE } from '../../shared/variable-definition'
import {
  ProviderTextGenerationError,
  ProviderTextGenerationService,
  type ProviderTextGenerationTarget
} from '../settings/provider-text-generation'
import type { VariableDefinitionCompleter } from './model-client'

const SYSTEM_PROMPT =
  '症例データは使わず、変数定義のJSON配列だけを返してください。研究計画から変数名、定義、記録の種類、コード化、型、許容範囲を取り出します。患者個人を特定する列は含めないでください。'

export const createSettingsVariableDefinitionCompleter = (options: {
  resolveTarget: () => Promise<ProviderTextGenerationTarget | null>
  generate?: ProviderTextGenerationService
}): VariableDefinitionCompleter => {
  const generate = options.generate ?? new ProviderTextGenerationService()
  return async (prompt) => {
    const target = await options.resolveTarget()
    if (!target || !generate.supportsTarget(target)) {
      throw new Error(VARIABLE_DEFINITION_MISSING_KEY_MESSAGE)
    }
    try {
      const result = await generate.run({
        target,
        systemPrompt: SYSTEM_PROMPT,
        prompt,
        signal: AbortSignal.timeout(120_000),
        maxOutputTokens: 8192,
        outputLimitBytes: 1_048_576
      })
      return result.text
    } catch (error) {
      if (error instanceof ProviderTextGenerationError && error.code === 'unsupported-target') {
        throw new Error(VARIABLE_DEFINITION_MISSING_KEY_MESSAGE)
      }
      if (
        error instanceof ProviderTextGenerationError &&
        /not sent|承認|送信/.test(error.message)
      ) {
        const gateText = error.message
          .replace(/^\[provider-text-generation:[^\]]+\]\s*/, '')
          .replace(/^\[provider-failure:[^\]]+\]\s*/, '')
        throw new Error(gateText)
      }
      if (error instanceof ProviderTextGenerationError) {
        throw new Error('変数定義のモデル呼び出しに失敗しました。')
      }
      throw error
    }
  }
}
