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
  empty: '研究計画を入力してください。'
}

const catalogs: Record<string, VariableDefinitionCopy> = {
  ja,
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
    empty: 'Geben Sie einen Forschungsplan ein.'
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
    empty: 'Introduzca el plan de investigación.'
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
    empty: 'Saisissez le plan de recherche.'
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
    empty: '请输入研究计划。'
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
    empty: '請輸入研究計畫。'
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
    empty: '연구 계획을 입력하십시오.'
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
    empty: 'Введите план исследования.'
  }
}

export const variableDefinitionCopy = (language = 'ja'): VariableDefinitionCopy =>
  catalogs[language] ?? ja
