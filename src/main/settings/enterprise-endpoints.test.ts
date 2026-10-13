import { describe, it, expect } from 'vitest'
import { openAiChatCompletionsUrl } from './base-url'
import { ENTERPRISE_MODEL_PRESETS, enterpriseModelPresetPatch, isVertexOpenAiBase } from '../../shared/enterprise-model-presets'

describe('Enterprise cloud endpoint routing', () => {
  it('retains the Azure v1 path', () => {
    expect(openAiChatCompletionsUrl({baseUrl:'https://resource.openai.azure.com/openai/v1'})).toBe('https://resource.openai.azure.com/openai/v1/chat/completions')
  })
  it('uses the Tokyo Bedrock runtime', () => {
    expect(openAiChatCompletionsUrl({baseUrl:ENTERPRISE_MODEL_PRESETS[1].baseUrl})).toBe('https://bedrock-runtime.ap-northeast-1.amazonaws.com/openai/v1/chat/completions')
  })
  it('preserves the documented Vertex compatibility path', () => {
    const base = ENTERPRISE_MODEL_PRESETS[2].baseUrl
    expect(openAiChatCompletionsUrl({baseUrl:base})).toBe(base+'/chat/completions')
    expect(isVertexOpenAiBase(base.replace('googleapis.com','googleapis.com.invalid'))).toBe(false)
  })
  it('clears credentials, model and capability guesses on preset selection', () => {
    const p=enterpriseModelPresetPatch(ENTERPRISE_MODEL_PRESETS[2])
    expect(p.key).toBe('')
    expect(p.model).toBe('')
    expect(p.supportsImageInput).toBe(false)
  })
})
