export type VariableDefinitionCompleter = (prompt: string) => Promise<string>

const contentFrom = (payload: unknown): string => {
  if (!payload || typeof payload !== 'object') return ''
  const choices = (payload as { choices?: unknown }).choices
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== 'object') return ''
  const message = (choices[0] as { message?: unknown }).message
  if (!message || typeof message !== 'object') return ''
  const content = (message as { content?: unknown }).content
  return typeof content === 'string' ? content : ''
}

export const createOpenAiVariableDefinitionCompleter = (options: {
  baseUrl: string
  model: string
  apiKey?: string
  fetchImpl?: typeof fetch
}): VariableDefinitionCompleter => {
  const fetchImpl = options.fetchImpl ?? fetch
  return async (prompt) => {
    const response = await fetchImpl(`${options.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : {})
      },
      body: JSON.stringify({
        model: options.model,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }]
      })
    })
    if (!response.ok) throw new Error('変数定義のモデル呼び出しに失敗しました。')
    const text = contentFrom(await response.json())
    if (!text.trim()) throw new Error('変数定義のモデルが空の応答を返しました。')
    return text
  }
}

export const defaultVariableDefinitionCompleter = (): VariableDefinitionCompleter => {
  const baseUrl = process.env.DRA_VARIABLE_DEFINITION_BASE_URL?.trim()
  const model = process.env.DRA_VARIABLE_DEFINITION_MODEL?.trim()
  if (!baseUrl || !model) {
    return async () => {
      throw new Error(
        '変数定義のモデルが未設定です。DRA_VARIABLE_DEFINITION_BASE_URL と DRA_VARIABLE_DEFINITION_MODEL を設定してください。'
      )
    }
  }
  return createOpenAiVariableDefinitionCompleter({
    baseUrl,
    model,
    apiKey: process.env.DRA_VARIABLE_DEFINITION_API_KEY
  })
}
