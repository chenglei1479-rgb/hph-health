import { copyForLocale } from '../../../../shared/copy-locale'
import type { Locale } from '../../../../shared/locale'

export type VariableDefinitionCopy = {
  open: string
  close: string
  title: string
  intro: string
  separated: string
  project: string
  plan: string
  generate: string
  exportTemplate: string
  name: string
  definition: string
  recordType: string
  coding: string
  type: string
  allowedRange: string
  empty: string
  warnings: string
  maskingCheck: string
  maskingCheckNote: string
  pseudonymized: string
}

const ja: VariableDefinitionCopy = {
  open: '変数定義表',
  close: '閉じる',
  title: '変数定義と収集テンプレート',
  intro:
    '研究計画から変数定義表を作ります。患者の表は使いません。書き出すExcelの見出し行は、ローカルNotebookが取り込む列名と同じです。',
  separated:
    '交付パッケージが使えるようになったら、そこからも開けます。いまはこの画面から作ります。',
  project: 'プロジェクト',
  plan: '研究計画',
  generate: '変数定義を作る',
  exportTemplate: '収集テンプレートを書き出す',
  name: '変数名',
  definition: '定義',
  recordType: '判断する記録',
  coding: 'コーディング',
  type: '型',
  allowedRange: '許容範囲',
  empty: '研究計画を入力してください。',
  warnings: '確認してください',
  maskingCheck: 'マスキングチェック',
  maskingCheckNote:
    '研究計画はマスキングチェックを通してからモデルに渡します。置き換えた箇所は仮名化済みです。',
  pseudonymized: '仮名化済み'
}

const en: VariableDefinitionCopy = {
  open: 'Variable definition table',
  close: 'Close',
  title: 'Variable definition and collection template',
  intro:
    'Build a variable definition table from the research plan. Patient tables are not used. The header row of the exported Excel file matches the column names the local Notebook imports.',
  separated:
    'When delivery packages are available, you can also open this from there. Until then, use this entry.',
  project: 'Project',
  plan: 'Research plan',
  generate: 'Generate variable definitions',
  exportTemplate: 'Export collection template',
  name: 'Variable name',
  definition: 'Definition',
  recordType: 'Record used for judgment',
  coding: 'Coding',
  type: 'Type',
  allowedRange: 'Allowed range',
  empty: 'Enter a research plan.',
  warnings: 'Please review',
  maskingCheck: 'Masking check',
  maskingCheckNote:
    'The research plan passes through the masking check before it is sent to the model. Replaced passages are marked as pseudonymized.',
  pseudonymized: 'Pseudonymized'
}

const catalogs = {
  ja,
  en,
  de: {
    ...ja,
    open: 'Variablendefinition',
    close: 'Schließen',
    title: 'Variablendefinition und Erfassungsvorlage',
    intro:
      'Aus dem Forschungsplan wird eine Variablendefinition erzeugt. Patiententabellen werden nicht verwendet. Die Kopfzeile der Excel-Datei entspricht den Spalten, die das lokale Notebook importiert.',
    separated:
      'Sobald die Ergebnisspakete verfügbar sind, lässt sich dies auch dort öffnen. Bis dahin verwenden Sie diesen Einstieg.',
    project: 'Projekt',
    plan: 'Forschungsplan',
    generate: 'Variablendefinition erzeugen',
    exportTemplate: 'Erfassungsvorlage exportieren',
    name: 'Variablenname',
    definition: 'Definition',
    recordType: 'Quelle der Beurteilung',
    coding: 'Kodierung',
    type: 'Typ',
    allowedRange: 'Zulässiger Bereich',
    empty: 'Geben Sie einen Forschungsplan ein.',
    warnings: 'Bitte prüfen',
    maskingCheck: 'Maskierungsprüfung',
    maskingCheckNote:
      'Der Forschungsplan durchläuft die Maskierungsprüfung, bevor er an das Modell geht. Ersetzte Stellen sind pseudonymisiert.',
    pseudonymized: 'Pseudonymisiert'
  },
  es: {
    ...ja,
    open: 'Tabla de variables',
    close: 'Cerrar',
    title: 'Definición de variables y plantilla de recogida',
    intro:
      'Genere la tabla de variables a partir del plan de investigación. No se utilizan tablas de pacientes. La fila de encabezado del Excel coincide con las columnas que importa el Notebook local.',
    separated:
      'Cuando los paquetes de entrega estén disponibles, también podrá abrirlo desde allí. Mientras tanto, utilice esta entrada.',
    project: 'Proyecto',
    plan: 'Plan de investigación',
    generate: 'Generar definición de variables',
    exportTemplate: 'Exportar plantilla de recogida',
    name: 'Nombre de la variable',
    definition: 'Definición',
    recordType: 'Registro para el juicio',
    coding: 'Codificación',
    type: 'Tipo',
    allowedRange: 'Rango permitido',
    empty: 'Introduzca el plan de investigación.',
    warnings: 'Revise lo siguiente',
    maskingCheck: 'Comprobación de enmascaramiento',
    maskingCheckNote:
      'El plan de investigación pasa por la comprobación de enmascaramiento antes de enviarse al modelo. Los fragmentos sustituidos quedan seudonimizados.',
    pseudonymized: 'Seudonimizado'
  },
  fr: {
    ...ja,
    open: 'Table de variables',
    close: 'Fermer',
    title: 'Définition des variables et modèle de recueil',
    intro:
      'La table de variables est produite à partir du plan de recherche. Aucune table de patients n’est utilisée. L’en-tête du classeur Excel correspond aux colonnes importées par le Notebook local.',
    separated:
      'Lorsque les paquets livrables seront disponibles, cette entrée y sera aussi proposée. En attendant, utilisez cet écran.',
    project: 'Projet',
    plan: 'Plan de recherche',
    generate: 'Produire la définition des variables',
    exportTemplate: 'Exporter le modèle de recueil',
    name: 'Nom de la variable',
    definition: 'Définition',
    recordType: 'Document source',
    coding: 'Codage',
    type: 'Type',
    allowedRange: 'Plage autorisée',
    empty: 'Saisissez le plan de recherche.',
    warnings: 'À vérifier',
    maskingCheck: 'Contrôle de masquage',
    maskingCheckNote:
      'Le plan de recherche passe par le contrôle de masquage avant d’être transmis au modèle. Les passages remplacés sont pseudonymisés.',
    pseudonymized: 'Pseudonymisé'
  },
  'zh-Hans': {
    ...ja,
    open: '变量定义表',
    close: '关闭',
    title: '变量定义与采集模板',
    intro:
      '根据研究计划生成变量定义表。不使用患者表。导出的 Excel 表头与本地 Notebook 导入所期望的列名一致。',
    separated: '交付包可用后，也可以从那里打开。在此之前请使用这个入口。',
    project: '项目',
    plan: '研究计划',
    generate: '生成变量定义',
    exportTemplate: '导出采集模板',
    name: '变量名',
    definition: '定义',
    recordType: '判断所用记录',
    coding: '编码',
    type: '类型',
    allowedRange: '允许范围',
    empty: '请输入研究计划。',
    warnings: '请确认',
    maskingCheck: '脱敏检查',
    maskingCheckNote: '研究计划会先经过脱敏检查，再交给模型。被替换的位置标记为已假名化。',
    pseudonymized: '已假名化'
  },
  'zh-Hant': {
    ...ja,
    open: '變數定義表',
    close: '關閉',
    title: '變數定義與蒐集範本',
    intro:
      '依研究計畫產生變數定義表。不使用患者表。匯出的 Excel 標題列與本機 Notebook 匯入所期望的欄名相同。',
    separated: '交付包可用後，也可以從那裡開啟。在此之前請使用這個入口。',
    project: '專案',
    plan: '研究計畫',
    generate: '產生變數定義',
    exportTemplate: '匯出蒐集範本',
    name: '變數名',
    definition: '定義',
    recordType: '判斷所用紀錄',
    coding: '編碼',
    type: '類型',
    allowedRange: '允許範圍',
    empty: '請輸入研究計畫。',
    warnings: '請確認',
    maskingCheck: '遮罩檢查',
    maskingCheckNote: '研究計畫會先經過遮罩檢查，再交給模型。被替換的位置標記為已假名化。',
    pseudonymized: '已假名化'
  },
  ko: {
    ...ja,
    open: '변수 정의표',
    close: '닫기',
    title: '변수 정의와 수집 서식',
    intro:
      '연구 계획에서 변수 정의표를 만듭니다. 환자 표는 사용하지 않습니다. 내보내는 Excel의 머리글은 로컬 Notebook이 가져오는 열 이름과 같습니다.',
    separated:
      '산출물 패키지를 쓸 수 있게 되면 그곳에서도 열 수 있습니다. 그때까지는 이 화면을 사용하십시오.',
    project: '프로젝트',
    plan: '연구 계획',
    generate: '변수 정의 만들기',
    exportTemplate: '수집 서식 내보내기',
    name: '변수 이름',
    definition: '정의',
    recordType: '판단에 쓰는 기록',
    coding: '코딩',
    type: '유형',
    allowedRange: '허용 범위',
    empty: '연구 계획을 입력하십시오.',
    warnings: '확인해 주십시오',
    maskingCheck: '마스킹 검사',
    maskingCheckNote:
      '연구 계획은 마스킹 검사를 거친 뒤 모델에 전달합니다. 바뀐 부분은 가명 처리되었습니다.',
    pseudonymized: '가명 처리됨'
  },
  ru: {
    ...ja,
    open: 'Таблица переменных',
    close: 'Закрыть',
    title: 'Определения переменных и шаблон сбора',
    intro:
      'Таблица переменных строится по плану исследования. Таблицы пациентов не используются. Строка заголовка Excel совпадает со столбцами, которые импортирует локальный Notebook.',
    separated:
      'Когда пакеты результатов станут доступны, эту функцию можно будет открыть и оттуда. Пока используйте этот вход.',
    project: 'Проект',
    plan: 'План исследования',
    generate: 'Создать определения переменных',
    exportTemplate: 'Экспортировать шаблон сбора',
    name: 'Имя переменной',
    definition: 'Определение',
    recordType: 'Источник оценки',
    coding: 'Кодирование',
    type: 'Тип',
    allowedRange: 'Допустимый диапазон',
    empty: 'Введите план исследования.',
    warnings: 'Проверьте',
    maskingCheck: 'Проверка маскирования',
    maskingCheckNote:
      'План исследования проходит проверку маскирования, прежде чем попасть в модель. Заменённые фрагменты псевдонимизированы.',
    pseudonymized: 'Псевдонимизировано'
  }
} satisfies Record<Locale, VariableDefinitionCopy>

export const variableDefinitionCopy = (language?: string): VariableDefinitionCopy =>
  copyForLocale(catalogs, language)
