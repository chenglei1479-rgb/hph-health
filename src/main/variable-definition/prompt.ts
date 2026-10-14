export const buildVariableDefinitionPrompt = (researchPlan: string): string =>
  [
    '研究計画だけを読み、症例データは使わずに変数定義表を作ってください。',
    '出力はJSON配列だけです。説明文やMarkdownは付けないでください。',
    '各要素のキーは name, definition, recordType, coding, type, allowedRange です。',
    'name は日本語の変数名です。definition は定義です。',
    'recordType は判断に使う記録の種類です。例: 経過記録、退院サマリー。',
    'coding はコード化です。例: 術後感染: あり=1/なし=0。',
    'type は integer, number, binary, categorical, date, text のいずれかです。',
    'allowedRange は許容範囲です。例: 0-120、または あり=1/なし=0。',
    '',
    '研究計画:',
    researchPlan
  ].join('\n')
