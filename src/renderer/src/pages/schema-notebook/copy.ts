// Japanese is the beta UI. The other catalogs are ready to merge into the shared
// renderer namespace after the in-flight locale edits land; this feature does not
// edit those files.

export type SchemaNotebookCopy = {
  badge: string
  badgeNote: string
  open: string
  close: string
  title: string
  intro: string
  file: string
  patientData: string
  import: string
  columns: string
  rows: string
  synthetic: string
  categorical: string
  categoricalNote: string
  code: string
  run: string
  localResult: string
  modelView: string
  blocked: string
  tagged: string
  language: string
  identifierWarnings: string
}

const ja: SchemaNotebookCopy = {
  badge: '患者データを含む',
  badgeNote: 'この印は外せません。患者データを含まない作業には新しいプロジェクトが必要です。',
  open: '患者表を分析',
  close: '閉じる',
  title: 'ローカルNotebook（スキーマのみ）',
  intro:
    '表は手元のNotebookで分析します。モデルに渡すのは列名・型・行数と、スキーマから作った合成サンプルだけです。',
  file: 'CSVまたはExcel',
  patientData: 'この表は患者データです',
  import: 'ファイルを取り込む',
  columns: '列',
  rows: '行数',
  synthetic: '合成サンプル（実データから作っていません）',
  categorical: 'この列のカテゴリ値をモデルに渡す',
  categoricalNote: '既定では渡しません。渡すと記録されます。',
  code: 'PythonまたはRのコード',
  run: '手元で実行',
  localResult: '手元の結果',
  modelView: 'モデルに渡す内容',
  blocked: 'この端末は病院の承認を受けていないため、個人情報を含むファイルは取り込めません。',
  tagged: 'このプロジェクトは患者データを含むため、印を外すことはできません。',
  language: '言語',
  identifierWarnings: '直接識別子の列はモデルに渡しません'
}

const catalogs: Record<string, SchemaNotebookCopy> = {
  ja,
  de: {
    ...ja,
    badge: 'Enthält Patientendaten',
    badgeNote:
      'Dieses Kennzeichen kann nicht entfernt werden. Legen Sie ein neues Projekt an, um ohne Patientendaten zu arbeiten.',
    open: 'Patiententabelle analysieren',
    close: 'Schließen',
    title: 'Lokales Notebook (nur Schema)',
    intro:
      'Die Tabelle wird nur im lokalen Notebook analysiert. Das Modell erhält Spaltennamen, Typen, die Zeilenzahl und synthetische Beispielzeilen aus dem Schema.',
    file: 'CSV oder Excel',
    patientData: 'Diese Tabelle enthält Patientendaten',
    import: 'Datei importieren',
    columns: 'Spalten',
    rows: 'Zeilen',
    synthetic: 'Synthetische Beispiele (nicht aus den echten Zeilen)',
    categorical: 'Kategoriewerte dieser Spalte an das Modell senden',
    categoricalNote: 'Standardmäßig werden sie nicht gesendet. Das Senden wird protokolliert.',
    code: 'Python- oder R-Code',
    run: 'Lokal ausführen',
    localResult: 'Lokales Ergebnis',
    modelView: 'An das Modell übergeben',
    blocked:
      'Dieser Rechner ist vom Krankenhaus nicht zugelassen. Eine Datei mit personenbezogenen Patientendaten kann nicht importiert werden.',
    tagged: 'Dieses Projekt enthält Patientendaten. Das Kennzeichen kann nicht entfernt werden.',
    language: 'Sprache'
  },
  es: {
    ...ja,
    badge: 'Contiene datos de pacientes',
    badgeNote:
      'Esta marca no se puede quitar. Para trabajar sin datos de pacientes, cree un proyecto nuevo.',
    open: 'Analizar tabla de pacientes',
    close: 'Cerrar',
    title: 'Notebook local (solo esquema)',
    intro:
      'La tabla se analiza solo en el Notebook local. El modelo recibe nombres de columna, tipos, número de filas y filas sintéticas generadas a partir del esquema.',
    file: 'CSV o Excel',
    patientData: 'Esta tabla contiene datos de pacientes',
    import: 'Importar archivo',
    columns: 'Columnas',
    rows: 'Filas',
    synthetic: 'Muestra sintética (no procede de las filas reales)',
    categorical: 'Enviar al modelo los valores de categoría de esta columna',
    categoricalNote: 'No se envían de forma predeterminada. El envío queda registrado.',
    code: 'Código de Python o R',
    run: 'Ejecutar en local',
    localResult: 'Resultado local',
    modelView: 'Contenido que ve el modelo',
    blocked:
      'Este equipo no está aprobado por el hospital. No se puede importar un archivo con datos identificables de pacientes.',
    tagged: 'Este proyecto contiene datos de pacientes. La marca no se puede quitar.',
    language: 'Idioma'
  },
  fr: {
    ...ja,
    badge: 'Contient des données patients',
    badgeNote:
      'Ce badge ne peut pas être retiré. Créez un nouveau projet pour travailler sans données patients.',
    open: 'Analyser un tableau de patients',
    close: 'Fermer',
    title: 'Notebook local (schéma seul)',
    intro:
      'Le tableau est analysé uniquement dans le Notebook local. Le modèle reçoit les noms de colonnes, les types, le nombre de lignes et des lignes synthétiques issues du schéma.',
    file: 'CSV ou Excel',
    patientData: 'Ce tableau contient des données patients',
    import: 'Importer le fichier',
    columns: 'Colonnes',
    rows: 'Lignes',
    synthetic: 'Échantillon synthétique (non dérivé des lignes réelles)',
    categorical: 'Envoyer au modèle les valeurs de catégorie de cette colonne',
    categoricalNote: 'Elles ne sont pas envoyées par défaut. L’envoi est journalisé.',
    code: 'Code Python ou R',
    run: 'Exécuter localement',
    localResult: 'Résultat local',
    modelView: 'Contenu transmis au modèle',
    blocked:
      'Cette machine n’est pas approuvée par l’hôpital. Un fichier contenant des données patients identifiantes ne peut pas être importé.',
    tagged: 'Ce projet contient des données patients. Le badge ne peut pas être retiré.',
    language: 'Langue'
  },
  'zh-Hans': {
    ...ja,
    badge: '含有患者数据',
    badgeNote: '此标记无法去除。若要处理不含患者数据的工作，请新建项目。',
    open: '分析患者表',
    close: '关闭',
    title: '本地 Notebook（仅架构）',
    intro:
      '表格只在本地 Notebook 中分析。模型默认只收到列名、类型、行数，以及根据架构生成的合成样本行。',
    file: 'CSV 或 Excel',
    patientData: '此表包含患者数据',
    import: '导入文件',
    columns: '列',
    rows: '行数',
    synthetic: '合成样本（不是从真实行复制的）',
    categorical: '把此列的分类取值发给模型',
    categoricalNote: '默认不发送。发送会被记录。',
    code: 'Python 或 R 代码',
    run: '在本地运行',
    localResult: '本地结果',
    modelView: '交给模型的内容',
    blocked: '此计算机未经医院批准。不能导入含有患者个人信息的文件。',
    tagged: '此项目含有患者数据，标记无法去除。',
    language: '语言'
  },
  'zh-Hant': {
    ...ja,
    badge: '含有患者資料',
    badgeNote: '此標記無法移除。若要處理不含患者資料的工作，請新建專案。',
    open: '分析患者表',
    close: '關閉',
    title: '本地 Notebook（僅架構）',
    intro:
      '表格只在本地 Notebook 中分析。模型預設只收到欄名、類型、列數，以及依架構產生的合成樣本列。',
    file: 'CSV 或 Excel',
    patientData: '此表包含患者資料',
    import: '匯入檔案',
    columns: '欄',
    rows: '列數',
    synthetic: '合成樣本（不是從真實列複製的）',
    categorical: '把此欄的分類取值傳給模型',
    categoricalNote: '預設不傳送。傳送會被記錄。',
    code: 'Python 或 R 程式',
    run: '在本地執行',
    localResult: '本地結果',
    modelView: '交給模型的內容',
    blocked: '此電腦未經醫院核准。不能匯入含有患者個人資訊的檔案。',
    tagged: '此專案含有患者資料，標記無法移除。',
    language: '語言'
  },
  ko: {
    ...ja,
    badge: '환자 데이터 포함',
    badgeNote:
      '이 표시는 제거할 수 없습니다. 환자 데이터 없이 작업하려면 새 프로젝트가 필요합니다.',
    open: '환자 표 분석',
    close: '닫기',
    title: '로컬 Notebook(스키마만)',
    intro:
      '표는 로컬 Notebook에서만 분석합니다. 모델에는 열 이름, 형, 행 수와 스키마에서 만든 합성 표본만 전달합니다.',
    file: 'CSV 또는 Excel',
    patientData: '이 표는 환자 데이터입니다',
    import: '파일 가져오기',
    columns: '열',
    rows: '행 수',
    synthetic: '합성 표본(실제 행에서 만들지 않음)',
    categorical: '이 열의 범주 값을 모델에 보냄',
    categoricalNote: '기본적으로 보내지 않습니다. 보내면 기록됩니다.',
    code: 'Python 또는 R 코드',
    run: '로컬에서 실행',
    localResult: '로컬 결과',
    modelView: '모델에 전달하는 내용',
    blocked:
      '이 컴퓨터는 병원 승인을 받지 않았습니다. 환자 개인정보가 있는 파일은 가져올 수 없습니다.',
    tagged: '이 프로젝트는 환자 데이터를 포함하므로 표시를 제거할 수 없습니다.',
    language: '언어'
  },
  ru: {
    ...ja,
    badge: 'Содержит данные пациентов',
    badgeNote: 'Эту метку нельзя снять. Для работы без данных пациентов создайте новый проект.',
    open: 'Анализ таблицы пациентов',
    close: 'Закрыть',
    title: 'Локальный Notebook (только схема)',
    intro:
      'Таблица анализируется только в локальном Notebook. Модель получает имена столбцов, типы, число строк и синтетические строки, построенные по схеме.',
    file: 'CSV или Excel',
    patientData: 'Эта таблица содержит данные пациентов',
    import: 'Импортировать файл',
    columns: 'Столбцы',
    rows: 'Строки',
    synthetic: 'Синтетическая выборка (не из реальных строк)',
    categorical: 'Передать модели список категорий этого столбца',
    categoricalNote: 'По умолчанию список не передаётся. Передача записывается в журнал.',
    code: 'Код Python или R',
    run: 'Выполнить локально',
    localResult: 'Локальный результат',
    modelView: 'Что получит модель',
    blocked:
      'Этот компьютер не одобрен больницей. Файл с идентифицирующими данными пациента импортировать нельзя.',
    tagged: 'Проект содержит данные пациентов. Метку снять нельзя.',
    language: 'Язык'
  }
}

export const schemaNotebookCopy = (language = 'ja'): SchemaNotebookCopy =>
  catalogs[language] ?? catalogs[language.split('-')[0] ?? ''] ?? ja
