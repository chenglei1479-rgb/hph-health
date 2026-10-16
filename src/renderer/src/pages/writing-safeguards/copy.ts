import { copyForLocale } from '../../../../shared/copy-locale'
import type { Locale } from '../../../../shared/locale'
import { coiCheckboxLabel } from '../../../../shared/writing-safeguards/ai-usage-declaration'

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
  findingKarte: string
  findingBirth: string
  findingValue: string
  exported: string
}

const ja: Omit<WritingSafeguardsCopy, 'coi'> = {
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
  manuscript: '原稿',
  declaration: '開示の下書き',
  exportManuscript: '原稿を書き出す',
  exportFiles: 'ファイルを書き出す',
  files: 'スクリプト、レポート、結果表',
  confirm: '内容を確認したうえで書き出す',
  findings: '確認が必要な箇所',
  findingKarte: 'カルテ番号',
  findingBirth: '生年月日',
  findingValue: '個別の患者値',
  exported: '書き出しました。'
}

const catalogs = {
  ja,
  en: {
    open: 'Checks while writing',
    close: 'Close',
    title: 'Checks while writing',
    ethicsLabel: 'Ethics approval number',
    ethicsSave: 'Save approval number',
    ethicsSaved: 'Approval number saved.',
    project: 'Project',
    beginWriting: 'Start writing',
    writingStarted: 'Writing started.',
    declarationTitle: 'AI use disclosure',
    feature: 'Feature used',
    model: 'Model',
    purpose: 'Purpose',
    addUsage: 'Add a feature',
    rebuild: 'Rebuild the disclosure',
    manuscript: 'Manuscript',
    declaration: 'Disclosure draft',
    exportManuscript: 'Export manuscript',
    exportFiles: 'Export files',
    files: 'Scripts, reports, and result tables',
    confirm: 'Export after I have reviewed the contents',
    findings: 'Passages that need review',
    findingKarte: 'Chart number',
    findingBirth: 'Date of birth',
    findingValue: 'Individual patient value',
    exported: 'Exported.'
  },
  'zh-Hans': {
    open: '撰写时的确认',
    close: '关闭',
    title: '撰写时的确认',
    ethicsLabel: '伦理审查批准号',
    ethicsSave: '保存批准号',
    ethicsSaved: '已保存批准号。',
    project: '项目',
    beginWriting: '开始撰写',
    writingStarted: '已开始撰写。',
    declarationTitle: 'AI 使用披露',
    feature: '使用的功能',
    model: '模型',
    purpose: '用途',
    addUsage: '添加功能',
    rebuild: '重新生成披露文',
    manuscript: '文稿',
    declaration: '披露草稿',
    exportManuscript: '导出文稿',
    exportFiles: '导出文件',
    files: '脚本、报告和结果表',
    confirm: '确认内容后导出',
    findings: '需要确认的位置',
    findingKarte: '病历号',
    findingBirth: '出生日期',
    findingValue: '个别患者数值',
    exported: '已导出。'
  },
  'zh-Hant': {
    open: '撰寫時的確認',
    close: '關閉',
    title: '撰寫時的確認',
    ethicsLabel: '倫理審查核准編號',
    ethicsSave: '儲存核准編號',
    ethicsSaved: '已儲存核准編號。',
    project: '專案',
    beginWriting: '開始撰寫',
    writingStarted: '已開始撰寫。',
    declarationTitle: 'AI 使用揭露',
    feature: '使用的功能',
    model: '模型',
    purpose: '用途',
    addUsage: '新增功能',
    rebuild: '重新產生揭露文',
    manuscript: '文稿',
    declaration: '揭露草稿',
    exportManuscript: '匯出文稿',
    exportFiles: '匯出檔案',
    files: '指令碼、報告和結果表',
    confirm: '確認內容後匯出',
    findings: '需要確認的位置',
    findingKarte: '病歷號',
    findingBirth: '出生日期',
    findingValue: '個別患者數值',
    exported: '已匯出。'
  },
  de: {
    open: 'Prüfung beim Schreiben',
    close: 'Schließen',
    title: 'Prüfung beim Schreiben',
    ethicsLabel: 'Genehmigungsnummer der Ethikkommission',
    ethicsSave: 'Genehmigungsnummer speichern',
    ethicsSaved: 'Genehmigungsnummer gespeichert.',
    project: 'Projekt',
    beginWriting: 'Mit dem Schreiben beginnen',
    writingStarted: 'Schreiben begonnen.',
    declarationTitle: 'Offenlegung der KI-Nutzung',
    feature: 'Verwendete Funktion',
    model: 'Modell',
    purpose: 'Zweck',
    addUsage: 'Funktion hinzufügen',
    rebuild: 'Offenlegung neu erstellen',
    manuscript: 'Manuskript',
    declaration: 'Entwurf der Offenlegung',
    exportManuscript: 'Manuskript exportieren',
    exportFiles: 'Dateien exportieren',
    files: 'Skripte, Berichte und Ergebnistabellen',
    confirm: 'Nach Prüfung des Inhalts exportieren',
    findings: 'Stellen, die geprüft werden müssen',
    findingKarte: 'Krankenaktennummer',
    findingBirth: 'Geburtsdatum',
    findingValue: 'Einzelner Patientenwert',
    exported: 'Exportiert.'
  },
  es: {
    open: 'Comprobaciones al redactar',
    close: 'Cerrar',
    title: 'Comprobaciones al redactar',
    ethicsLabel: 'Número de aprobación ética',
    ethicsSave: 'Guardar número de aprobación',
    ethicsSaved: 'Número de aprobación guardado.',
    project: 'Proyecto',
    beginWriting: 'Empezar a redactar',
    writingStarted: 'Redacción iniciada.',
    declarationTitle: 'Declaración de uso de IA',
    feature: 'Función utilizada',
    model: 'Modelo',
    purpose: 'Finalidad',
    addUsage: 'Añadir función',
    rebuild: 'Regenerar la declaración',
    manuscript: 'Manuscrito',
    declaration: 'Borrador de la declaración',
    exportManuscript: 'Exportar manuscrito',
    exportFiles: 'Exportar archivos',
    files: 'Scripts, informes y tablas de resultados',
    confirm: 'Exportar tras revisar el contenido',
    findings: 'Pasajes que requieren revisión',
    findingKarte: 'Número de historia clínica',
    findingBirth: 'Fecha de nacimiento',
    findingValue: 'Valor individual del paciente',
    exported: 'Exportado.'
  },
  fr: {
    open: 'Vérifications pendant la rédaction',
    close: 'Fermer',
    title: 'Vérifications pendant la rédaction',
    ethicsLabel: 'Numéro d’approbation éthique',
    ethicsSave: 'Enregistrer le numéro d’approbation',
    ethicsSaved: 'Numéro d’approbation enregistré.',
    project: 'Projet',
    beginWriting: 'Commencer la rédaction',
    writingStarted: 'Rédaction commencée.',
    declarationTitle: 'Déclaration d’usage de l’IA',
    feature: 'Fonction utilisée',
    model: 'Modèle',
    purpose: 'Usage',
    addUsage: 'Ajouter une fonction',
    rebuild: 'Régénérer la déclaration',
    manuscript: 'Manuscrit',
    declaration: 'Brouillon de la déclaration',
    exportManuscript: 'Exporter le manuscrit',
    exportFiles: 'Exporter les fichiers',
    files: 'Scripts, rapports et tableaux de résultats',
    confirm: 'Exporter après vérification du contenu',
    findings: 'Passages à vérifier',
    findingKarte: 'Numéro de dossier',
    findingBirth: 'Date de naissance',
    findingValue: 'Valeur individuelle du patient',
    exported: 'Exporté.'
  },
  ko: {
    open: '집필 시 확인',
    close: '닫기',
    title: '집필 시 확인',
    ethicsLabel: '윤리심사 승인 번호',
    ethicsSave: '승인 번호 저장',
    ethicsSaved: '승인 번호를 저장했습니다.',
    project: '프로젝트',
    beginWriting: '집필 시작',
    writingStarted: '집필을 시작했습니다.',
    declarationTitle: 'AI 사용 공개',
    feature: '사용한 기능',
    model: '모델',
    purpose: '용도',
    addUsage: '기능 추가',
    rebuild: '공개문 다시 만들기',
    manuscript: '원고',
    declaration: '공개문 초안',
    exportManuscript: '원고 내보내기',
    exportFiles: '파일 내보내기',
    files: '스크립트, 보고서, 결과표',
    confirm: '내용을 확인한 뒤 내보내기',
    findings: '확인이 필요한 부분',
    findingKarte: '차트 번호',
    findingBirth: '생년월일',
    findingValue: '개별 환자 값',
    exported: '내보냈습니다.'
  },
  ru: {
    open: 'Проверка при написании',
    close: 'Закрыть',
    title: 'Проверка при написании',
    ethicsLabel: 'Номер одобрения этического комитета',
    ethicsSave: 'Сохранить номер одобрения',
    ethicsSaved: 'Номер одобрения сохранён.',
    project: 'Проект',
    beginWriting: 'Начать написание',
    writingStarted: 'Написание начато.',
    declarationTitle: 'Раскрытие использования ИИ',
    feature: 'Использованная функция',
    model: 'Модель',
    purpose: 'Назначение',
    addUsage: 'Добавить функцию',
    rebuild: 'Собрать текст раскрытия заново',
    manuscript: 'Рукопись',
    declaration: 'Черновик раскрытия',
    exportManuscript: 'Экспортировать рукопись',
    exportFiles: 'Экспортировать файлы',
    files: 'Скрипты, отчёты и таблицы результатов',
    confirm: 'Экспортировать после проверки содержимого',
    findings: 'Фрагменты, требующие проверки',
    findingKarte: 'Номер карты',
    findingBirth: 'Дата рождения',
    findingValue: 'Индивидуальное значение пациента',
    exported: 'Экспортировано.'
  }
} satisfies Record<Locale, Omit<WritingSafeguardsCopy, 'coi'>>

export const writingSafeguardsCopy = (language?: string): WritingSafeguardsCopy => ({
  ...copyForLocale(catalogs, language),
  coi: coiCheckboxLabel(language)
})
