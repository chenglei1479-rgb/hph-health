export type WritingSafeguardsCopy = {
  open: string
  close: string
  title: string
  ethicsLabel: string
  ethicsSave: string
  ethicsSaved: string
  project: string
  beginWriting: string
  writingStarted: string
  declarationTitle: string
  feature: string
  model: string
  purpose: string
  addUsage: string
  rebuild: string
  coi: string
  manuscript: string
  declaration: string
  exportManuscript: string
  exportFiles: string
  files: string
  confirm: string
  findings: string
  exported: string
}

const ja: WritingSafeguardsCopy = {
  open: '執筆時の確認',
  close: '閉じる',
  title: '執筆時の確認',
  ethicsLabel: '倫理審査の承認番号',
  ethicsSave: '承認番号を保存',
  ethicsSaved: '承認番号を保存しました。',
  project: 'プロジェクト',
  beginWriting: '執筆を始める',
  writingStarted: '執筆を始めました。',
  declarationTitle: 'AI利用の開示',
  feature: '使った機能',
  model: 'モデル',
  purpose: '用途',
  addUsage: '機能を追加',
  rebuild: '開示文を作り直す',
  coi: '利益相反の文を加える（DRA の無償提供を受けた／The authors received DRA free of charge.）',
  manuscript: '原稿',
  declaration: '開示の下書き',
  exportManuscript: '原稿を書き出す',
  exportFiles: 'ファイルを書き出す',
  files: 'スクリプト、レポート、結果表',
  confirm: '内容を確認したうえで書き出す',
  findings: '確認が必要な箇所',
  exported: '書き出しました。'
}

export const writingSafeguardsCopy = (language = 'ja'): WritingSafeguardsCopy =>
  language === 'ja' || language.startsWith('ja') ? ja : ja
