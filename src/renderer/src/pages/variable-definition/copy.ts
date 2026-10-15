import { copyForLocale } from '../../../../shared/copy-locale'
import type { Locale } from '../../../../shared/locale'
import { VARIABLE_DEFINITION_MISSING_KEY_MESSAGE } from '../../../../shared/variable-definition'

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
  missingKey: string
  droppedIdentifier: string
  rawDate: string
  identifierLabels: Record<string, string>
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
  pseudonymized: '仮名化済み',
  missingKey: VARIABLE_DEFINITION_MISSING_KEY_MESSAGE,
  droppedIdentifier:
    '「{{name}}」は直接識別子（{{label}}）のため、収集テンプレートから除きました。',
  rawDate:
    '「{{name}}」は暦日です。在院日数や退院〜再入院日数のような日数の列を優先してください。どうしても暦日が必要な場合だけ残しています。',
  identifierLabels: {
    氏名: '氏名',
    カルテ番号: 'カルテ番号',
    生年月日: '生年月日',
    住所: '住所',
    電話: '電話',
    マイナンバー: 'マイナンバー',
    保険番号: '保険番号',
    メール: 'メール'
  }
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
  pseudonymized: 'Pseudonymized',
  missingKey:
    'No API key is configured. Enter your own OpenAI or Azure key in the API key field in Settings.',
  droppedIdentifier:
    '“{{name}}” is a direct identifier ({{label}}) and was removed from the collection template.',
  rawDate:
    '“{{name}}” is a calendar date. Prefer a day-count column, such as length of stay or days from discharge to readmission. It is kept only when a calendar date is required.',
  identifierLabels: {
    氏名: 'name',
    カルテ番号: 'chart number',
    生年月日: 'date of birth',
    住所: 'address',
    電話: 'phone',
    マイナンバー: 'individual number',
    保険番号: 'insurance number',
    メール: 'email'
  }
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
    pseudonymized: 'Pseudonymisiert',
    missingKey:
      'Es ist kein API-Schlüssel hinterlegt. Tragen Sie Ihren eigenen OpenAI- oder Azure-Schlüssel im Feld für den API-Schlüssel unter Einstellungen ein.',
    droppedIdentifier:
      '„{{name}}“ ist ein direktes Identifikationsmerkmal ({{label}}) und wurde aus der Erfassungsvorlage entfernt.',
    rawDate:
      '„{{name}}“ ist ein Kalenderdatum. Bevorzugen Sie eine Tageszählung, etwa die Verweildauer oder die Tage von der Entlassung bis zur Wiederaufnahme. Das Datum bleibt nur, wenn ein Kalenderdatum erforderlich ist.',
    identifierLabels: {
      氏名: 'Name',
      カルテ番号: 'Aktennummer',
      生年月日: 'Geburtsdatum',
      住所: 'Adresse',
      電話: 'Telefon',
      マイナンバー: 'Personennummer',
      保険番号: 'Versicherungsnummer',
      メール: 'E-Mail'
    }
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
    pseudonymized: 'Seudonimizado',
    missingKey:
      'No hay una clave de API configurada. Introduzca su propia clave de OpenAI o Azure en el campo de clave de API de Configuración.',
    droppedIdentifier:
      '«{{name}}» es un identificador directo ({{label}}) y se ha quitado de la plantilla de recogida.',
    rawDate:
      '«{{name}}» es una fecha de calendario. Prefiera una columna de días, como la estancia o los días desde el alta hasta el reingreso. Se conserva solo cuando la fecha de calendario es necesaria.',
    identifierLabels: {
      氏名: 'nombre',
      カルテ番号: 'número de historia',
      生年月日: 'fecha de nacimiento',
      住所: 'dirección',
      電話: 'teléfono',
      マイナンバー: 'número personal',
      保険番号: 'número de seguro',
      メール: 'correo'
    }
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
    pseudonymized: 'Pseudonymisé',
    missingKey:
      'Aucune clé d’API n’est configurée. Saisissez votre propre clé OpenAI ou Azure dans le champ de clé d’API des paramètres.',
    droppedIdentifier:
      '« {{name}} » est un identifiant direct ({{label}}) et a été retiré du modèle de recueil.',
    rawDate:
      '« {{name}} » est une date calendaire. Préférez une colonne en jours, comme la durée de séjour ou les jours entre la sortie et la réadmission. Elle n’est conservée que si une date calendaire est nécessaire.',
    identifierLabels: {
      氏名: 'nom',
      カルテ番号: 'numéro de dossier',
      生年月日: 'date de naissance',
      住所: 'adresse',
      電話: 'téléphone',
      マイナンバー: 'numéro personnel',
      保険番号: 'numéro d’assurance',
      メール: 'e-mail'
    }
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
    pseudonymized: '已假名化',
    missingKey: '尚未设置 API 密钥。请在设置的 API 密钥栏中填入您自己的 OpenAI 或 Azure 密钥。',
    droppedIdentifier: '「{{name}}」是直接标识符（{{label}}），已从采集模板中移除。',
    rawDate:
      '「{{name}}」是日历日期。请优先使用住院天数或出院至再入院天数这类天数列。仅在确实需要日历日期时才保留。',
    identifierLabels: {
      氏名: '姓名',
      カルテ番号: '病历号',
      生年月日: '出生日期',
      住所: '地址',
      電話: '电话',
      マイナンバー: '个人编号',
      保険番号: '保险号',
      メール: '电子邮箱'
    }
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
    pseudonymized: '已假名化',
    missingKey: '尚未設定 API 金鑰。請在設定的 API 金鑰欄中填入您自己的 OpenAI 或 Azure 金鑰。',
    droppedIdentifier: '「{{name}}」是直接識別符（{{label}}），已從蒐集範本中移除。',
    rawDate:
      '「{{name}}」是日曆日期。請優先使用住院天數或出院至再入院天數這類天數列。僅在確實需要日曆日期時才保留。',
    identifierLabels: {
      氏名: '姓名',
      カルテ番号: '病歷號',
      生年月日: '出生日期',
      住所: '地址',
      電話: '電話',
      マイナンバー: '個人編號',
      保険番号: '保險號',
      メール: '電子郵件'
    }
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
    pseudonymized: '가명 처리됨',
    missingKey:
      'API 키가 설정되어 있지 않습니다. 설정의 API 키 칸에 본인의 OpenAI 또는 Azure 키를 입력하십시오.',
    droppedIdentifier: '‘{{name}}’은(는) 직접 식별자({{label}})이므로 수집 서식에서 제외했습니다.',
    rawDate:
      '‘{{name}}’은(는) 달력 날짜입니다. 재원 일수나 퇴원 후 재입원까지의 일수처럼 일수 열을 우선하십시오. 달력 날짜가 꼭 필요할 때만 남깁니다.',
    identifierLabels: {
      氏名: '성명',
      カルテ番号: '차트 번호',
      生年月日: '생년월일',
      住所: '주소',
      電話: '전화',
      マイナンバー: '개인 번호',
      保険番号: '보험 번호',
      メール: '이메일'
    }
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
    pseudonymized: 'Псевдонимизировано',
    missingKey:
      'Ключ API не задан. Введите собственный ключ OpenAI или Azure в поле ключа API в настройках.',
    droppedIdentifier:
      '«{{name}}» — прямой идентификатор ({{label}}), поэтому столбец удалён из шаблона сбора.',
    rawDate:
      '«{{name}}» — календарная дата. Предпочтительнее столбец с числом дней, например длительность пребывания или дни от выписки до повторной госпитализации. Дата сохраняется только если календарная дата необходима.',
    identifierLabels: {
      氏名: 'имя',
      カルテ番号: 'номер карты',
      生年月日: 'дата рождения',
      住所: 'адрес',
      電話: 'телефон',
      マイナンバー: 'личный номер',
      保険番号: 'номер страховки',
      メール: 'электронная почта'
    }
  }
} satisfies Record<Locale, VariableDefinitionCopy>

export const variableDefinitionCopy = (language?: string): VariableDefinitionCopy =>
  copyForLocale(catalogs, language)

const DROPPED_IDENTIFIER = /^「(.+)」は直接識別子（(.+)）のため、収集テンプレートから除きました。$/

const fill = (template: string, values: Record<string, string>): string =>
  Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{{${key}}}`, value),
    template
  )

export const variableDefinitionPanelMessage = (
  language: string | undefined,
  message: string
): string =>
  message === VARIABLE_DEFINITION_MISSING_KEY_MESSAGE
    ? variableDefinitionCopy(language).missingKey
    : message

export const variableDefinitionWarningText = (
  language: string | undefined,
  warning: { code: string; name: string; message: string }
): string => {
  const copy = variableDefinitionCopy(language)
  if (warning.code === 'dropped-identifier') {
    const match = DROPPED_IDENTIFIER.exec(warning.message)
    const name = match?.[1] ?? warning.name
    const rawLabel = match?.[2] ?? ''
    const label = (rawLabel && copy.identifierLabels[rawLabel]) || rawLabel
    return fill(copy.droppedIdentifier, { name, label })
  }
  if (warning.code === 'raw-date') return fill(copy.rawDate, { name: warning.name })
  return warning.message
}
