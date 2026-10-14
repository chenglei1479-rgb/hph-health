import {
  externalEndpointEntries,
  userConfiguredModelEntry,
  type ExternalEndpointEntry
} from './external-endpoints'

const requirementLabel = (entry: ExternalEndpointEntry): string =>
  entry.requirement === 'required' ? '必須' : '任意'

const defaultLabel = (entry: ExternalEndpointEntry): string =>
  entry.defaultEnabled ? 'オン' : 'オフ'

const disclosedName = (entry: ExternalEndpointEntry): string =>
  entry.disclosureNameJa ?? entry.host ?? '利用者が設定した AI サービス'

const row = (entry: ExternalEndpointEntry): string =>
  [
    disclosedName(entry),
    entry.dataSentJa,
    entry.recipientJa,
    entry.purposeJa,
    requirementLabel(entry),
    defaultLabel(entry)
  ].join(' | ')

export const renderExternalTransmissionsMarkdown = (): string => {
  const model = userConfiguredModelEntry()
  const lines = [
    '## 外部送信',
    '',
    'この一覧は `resources/external-endpoints.json` から生成しています。アプリが連絡してよい外部ホストは、ここに載る静的ホストと、利用者が設定した AI サービスだけです。',
    '',
    '| ホスト | 送信するデータ | 送信先 | 目的 | 必須/任意 | 既定 |',
    '| --- | --- | --- | --- | --- | --- |',
    ...externalEndpointEntries().map((entry) => `| ${row(entry)} |`)
  ]
  if (model.exampleHosts && model.exampleHosts.length > 0) {
    lines.push(
      '',
      '### ユーザーが選べる公式モデルのホスト',
      '',
      '次のホストは公式カタログの例です。ユーザーがそのモデルを設定するまで、アプリはこれらのホストへ送りません。',
      '',
      ...model.exampleHosts.map((host) => `- \`${host}\``)
    )
  }
  return lines.join('\n')
}

export const renderHospitalAllowlistMarkdown = (): string => {
  const generated = [
    '# 病院 IT 向け外部通信許可リスト',
    '',
    'このファイルは `resources/external-endpoints.json` から生成しています。手で編集せず、カタログを更新してから生成し直してください。',
    '',
    'DRA のメインプロセスは、この一覧にないホスト（および利用者が設定した AI サービス以外）への送信を拒否し、ホスト名だけをログに残します。',
    '',
    renderExternalTransmissionsMarkdown(),
    ''
  ].join('\n')
  return generated
}

export const NOTICE_BEGIN = '<!-- external-endpoints:begin -->'
export const NOTICE_END = '<!-- external-endpoints:end -->'

export const replaceExternalTransmissionsSection = (notice: string): string => {
  const section = `${NOTICE_BEGIN}\n${renderExternalTransmissionsMarkdown()}\n${NOTICE_END}`
  const pattern = new RegExp(`${NOTICE_BEGIN}[\\s\\S]*?${NOTICE_END}`)
  if (pattern.test(notice)) return notice.replace(pattern, section)
  const trimmed = notice.replace(/\s*$/, '')
  return `${trimmed}\n\n${section}\n`
}
