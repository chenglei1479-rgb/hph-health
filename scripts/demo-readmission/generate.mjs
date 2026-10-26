/* eslint-disable @typescript-eslint/explicit-function-return-type -- standalone generator, same as other scripts. */
// Builds the fictional demo-readmission cohort and the sample conference abstract.
// Local only: no network, no model, no patient-table paths.
//
// The folder did not exist in git history. See resources/demo-readmission/PROVENANCE.md.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SEED = 0xd4ba9a11
const ROW_COUNT = 240
const JA_DISCLAIMER = '架空のデータによるデモです。実在の患者・研究結果ではありません'
const FOOTER_MARK = 'ベースリオ デモ'

const AGE_BANDS = ['18-39', '40-64', '65-79', '80+']
const SEXES = ['F', 'M']

const mulberry32 = (seed) => {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

export const buildCohort = () => {
  const random = mulberry32(SEED)
  const rows = []
  for (let index = 1; index <= ROW_COUNT; index += 1) {
    rows.push({
      record_id: `SYNTH-${String(index).padStart(4, '0')}`,
      provenance: 'SYNTHETIC',
      age_band: AGE_BANDS[Math.floor(random() * AGE_BANDS.length)],
      sex: SEXES[Math.floor(random() * SEXES.length)],
      los_days: 1 + Math.floor(random() * 20),
      readmitted_30d: random() < 0.18 ? 1 : 0
    })
  }
  return rows
}

const percent = (events, total) =>
  total === 0 ? '0.0' : (Math.round((events * 1000) / total) / 10).toFixed(1)

const countWhere = (rows, predicate) => rows.reduce((sum, row) => sum + (predicate(row) ? 1 : 0), 0)

export const summarizeCohort = (rows) => {
  const events = countWhere(rows, (row) => row.readmitted_30d === 1)
  const groups = [{ label: 'All', rows }]
  for (const sex of SEXES) groups.push({ label: sex, rows: rows.filter((row) => row.sex === sex) })
  for (const band of AGE_BANDS) {
    groups.push({ label: band, rows: rows.filter((row) => row.age_band === band) })
  }
  return {
    n: rows.length,
    events,
    rate: percent(events, rows.length),
    groups: groups.map((group) => {
      const groupEvents = countWhere(group.rows, (row) => row.readmitted_30d === 1)
      return {
        label: group.label,
        records: String(group.rows.length),
        readmitted: String(groupEvents),
        rate: percent(groupEvents, group.rows.length)
      }
    })
  }
}

const escapeHtml = (value) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

const page = (title, disclaimer, blocks) => ({
  title,
  disclaimer,
  blocks,
  footerDisclaimer: disclaimer,
  footerMark: FOOTER_MARK
})

const paragraph = (text) => ({ type: 'p', text })

const table = (headers, rows) => ({ type: 'table', headers, rows })

const copyFor = (locale, stats) => {
  const tableRows = stats.groups.map((group) => [
    group.label,
    group.records,
    group.readmitted,
    group.rate
  ])
  if (locale === 'ja') {
    return {
      htmlLang: 'ja',
      pages: [
        page('架空サンプル：合成コホートの30日再入院', JA_DISCLAIMER, [
          paragraph(
            'これは学会抄録の画面を確認するための架空サンプルです。入力は合成した表だけです。'
          ),
          paragraph(
            `方法：resources/demo-readmission/cohort.csv の合成行 ${stats.n} 件を、この端末上で集計しました。モデルは呼んでいません。readmitted_30d が 1 の行を再入院と数えています。`
          ),
          paragraph(
            `結果：合成行 ${stats.n} 件のうち、再入院の印が付いた行は ${stats.events} 件（${stats.rate}%）でした。`
          ),
          paragraph('この数字は診療や審査の根拠にはできません。')
        ]),
        page('集計', JA_DISCLAIMER, [
          paragraph('区分ごとの件数です。個人の行は含みません。'),
          table(['区分', '行数', '再入院', '%'], tableRows)
        ]),
        page('このサンプルの範囲', JA_DISCLAIMER, [
          paragraph(
            '集計はこの端末の中だけで計算しています。ネットワークにもモデルにも送っていません。'
          ),
          paragraph(
            'すべての行の provenance は SYNTHETIC です。氏名、カルテ番号、生年月日はありません。'
          )
        ])
      ]
    }
  }
  if (locale === 'zh-Hans') {
    const disclaimer = '此为虚构数据演示，并非真实患者或研究结果。'
    return {
      htmlLang: 'zh-Hans',
      pages: [
        page('虚构样本：合成队列的30日再入院', disclaimer, [
          paragraph('这是用来查看学会摘要版式的虚构样本。输入只有合成表。'),
          paragraph(
            `方法：在本机汇总 resources/demo-readmission/cohort.csv 的 ${stats.n} 行合成记录。没有调用模型。readmitted_30d 为 1 的行计为再入院。`
          ),
          paragraph(
            `结果：${stats.n} 行合成记录中，标为再入院的有 ${stats.events} 行（${stats.rate}%）。`
          ),
          paragraph('这些数字不能当作诊疗或审查的依据。')
        ]),
        page('汇总', disclaimer, [
          paragraph('以下是分组件数，不含个人行。'),
          table(['分组', '行数', '再入院', '%'], tableRows)
        ]),
        page('本样本的范围', disclaimer, [
          paragraph('汇总只在本机计算，没有发往网络，也没有调用模型。'),
          paragraph('每一行的 provenance 都是 SYNTHETIC。没有姓名、病历号或出生日期。')
        ])
      ]
    }
  }
  if (locale === 'zh-Hant') {
    const disclaimer = '此為虛構資料演示，並非真實患者或研究結果。'
    return {
      htmlLang: 'zh-Hant',
      pages: [
        page('虛構樣本：合成隊列的30日再入院', disclaimer, [
          paragraph('這是用來查看學會摘要版式的虛構樣本。輸入只有合成表。'),
          paragraph(
            `方法：在本機彙總 resources/demo-readmission/cohort.csv 的 ${stats.n} 列合成紀錄。沒有呼叫模型。readmitted_30d 為 1 的列計為再入院。`
          ),
          paragraph(
            `結果：${stats.n} 列合成紀錄中，標為再入院的有 ${stats.events} 列（${stats.rate}%）。`
          ),
          paragraph('這些數字不能當作診療或審查的依據。')
        ]),
        page('彙總', disclaimer, [
          paragraph('以下是分組件數，不含個人列。'),
          table(['分組', '列數', '再入院', '%'], tableRows)
        ]),
        page('本樣本的範圍', disclaimer, [
          paragraph('彙總只在本機計算，沒有發往網路，也沒有呼叫模型。'),
          paragraph('每一列的 provenance 都是 SYNTHETIC。沒有姓名、病歷號或出生日期。')
        ])
      ]
    }
  }
  const localized = {
    de: [
      'Fiktives Beispiel: 30-Tage-Wiederaufnahme',
      'Diese Demo verwendet fiktive Daten. Sie zeigt keine echten Patienten oder Studienergebnisse.',
      'Ein fiktives Beispiel für die Ansicht eines Kongressabstracts. Die Eingabe ist eine synthetische Tabelle.',
      `Methoden: ${stats.n} synthetische Zeilen wurden auf diesem Computer gezählt. Es wurde kein Modell aufgerufen. Der Wert 1 in der Wiederaufnahmespalte zählt als Wiederaufnahme.`,
      `Ergebnisse: ${stats.events} von ${stats.n} synthetischen Zeilen (${stats.rate} %) sind als wiederaufgenommen markiert.`,
      'Diese Zahlen sind keine Grundlage für Behandlung oder Begutachtung.',
      'Häufigkeiten',
      'Gruppierte Häufigkeiten ohne einzelne Datensätze.',
      'Gruppe',
      'Zeilen',
      'Wiederaufgenommen',
      'Umfang dieses Beispiels',
      'Die Häufigkeiten wurden lokal berechnet. Es gab keine Netzwerkübertragung und keinen Modellaufruf.',
      'Alle Zeilen sind als synthetisch gekennzeichnet. Es gibt keine Namen, Aktennummern oder Geburtsdaten.',
      'Alle',
      'Weiblich',
      'Männlich',
      'Baselio Demo'
    ],
    es: [
      'Ejemplo ficticio: reingreso a los 30 días',
      'Esta demostración utiliza datos ficticios. No representa pacientes reales ni resultados de un estudio.',
      'Ejemplo ficticio de la pantalla de resumen de congreso. La entrada es una tabla sintética.',
      `Métodos: se contaron ${stats.n} filas sintéticas en este equipo. No se llamó a ningún modelo. El valor 1 en la columna de reingreso cuenta como reingreso.`,
      `Resultados: ${stats.events} de ${stats.n} filas sintéticas (${stats.rate} %) están marcadas como reingreso.`,
      'Estas cifras no sirven para tomar decisiones asistenciales ni de revisión.',
      'Recuentos',
      'Recuentos por grupo sin filas individuales.',
      'Grupo',
      'Filas',
      'Reingresos',
      'Alcance del ejemplo',
      'Los recuentos se calcularon localmente, sin transmisión por la red ni llamadas a modelos.',
      'Todas las filas están marcadas como sintéticas. No hay nombres, números de historia ni fechas de nacimiento.',
      'Todos',
      'Mujeres',
      'Hombres',
      'Demostración de Baselio'
    ],
    fr: [
      'Exemple fictif : réadmission à 30 jours',
      'Cette démonstration utilise des données fictives. Elle ne représente ni patients réels ni résultats d’étude.',
      'Exemple fictif de l’écran de résumé de congrès. Seul un tableau synthétique est utilisé.',
      `Méthodes : ${stats.n} lignes synthétiques ont été comptées sur cet ordinateur. Aucun modèle n’a été appelé. La valeur 1 dans la colonne de réadmission compte comme une réadmission.`,
      `Résultats : ${stats.events} lignes sur ${stats.n} (${stats.rate} %) sont marquées comme réadmises.`,
      'Ces chiffres ne peuvent étayer une décision de soin ou d’évaluation.',
      'Effectifs',
      'Effectifs par groupe sans lignes individuelles.',
      'Groupe',
      'Lignes',
      'Réadmissions',
      'Portée de cet exemple',
      'Les effectifs ont été calculés localement, sans transmission réseau ni appel à un modèle.',
      'Toutes les lignes sont signalées comme synthétiques. Aucun nom, numéro de dossier ou date de naissance.',
      'Tous',
      'Femmes',
      'Hommes',
      'Démo Baselio'
    ],
    ko: [
      '가상 샘플: 30일 이내 재입원',
      '가상 데이터를 사용한 데모입니다. 실제 환자나 연구 결과가 아닙니다.',
      '학회 초록 화면을 확인하기 위한 가상 샘플입니다. 합성 표만 입력으로 사용합니다.',
      `방법: 이 컴퓨터에서 합성 행 ${stats.n}개를 집계했습니다. 모델을 호출하지 않았습니다. 재입원 열의 값이 1인 행을 재입원으로 집계합니다.`,
      `결과: 합성 행 ${stats.n}개 중 ${stats.events}개(${stats.rate}%)가 재입원으로 표시되었습니다.`,
      '이 수치는 진료나 심사 판단의 근거로 사용할 수 없습니다.',
      '집계',
      '개별 행을 제외한 그룹별 집계입니다.',
      '그룹',
      '행 수',
      '재입원',
      '샘플 범위',
      '이 컴퓨터에서만 집계했으며 네트워크 전송이나 모델 호출은 없었습니다.',
      '모든 행은 합성 데이터로 표시됩니다. 이름, 의무기록 번호, 생년월일은 없습니다.',
      '전체',
      '여성',
      '남성',
      '바젤리오 데모'
    ],
    ru: [
      'Вымышленный пример: повторная госпитализация за 30 дней',
      'Демонстрация использует вымышленные данные. Это не реальные пациенты и не результаты исследования.',
      'Вымышленный пример экрана тезисов конференции. Входные данные — синтетическая таблица.',
      `Методы: на этом компьютере подсчитано ${stats.n} синтетических строк. Модель не вызывалась. Значение 1 в столбце повторной госпитализации учитывается как повторная госпитализация.`,
      `Результаты: ${stats.events} из ${stats.n} синтетических строк (${stats.rate} %) отмечены как повторные госпитализации.`,
      'Эти числа нельзя использовать для лечебных решений или экспертизы.',
      'Подсчёты',
      'Подсчёты по группам без отдельных строк.',
      'Группа',
      'Строки',
      'Повторные госпитализации',
      'Область применения примера',
      'Подсчёты выполнены локально, без передачи по сети и без вызова модели.',
      'Все строки отмечены как синтетические. Имен, номеров историй болезни и дат рождения нет.',
      'Все',
      'Женщины',
      'Мужчины',
      'Демонстрация Baselio'
    ]
  }[locale]
  if (localized) {
    const c = localized
    const labels = { All: c[14], F: c[15], M: c[16] }
    const pages = [
      page(c[0], c[1], [paragraph(c[2]), paragraph(c[3]), paragraph(c[4]), paragraph(c[5])]),
      page(c[6], c[1], [
        paragraph(c[7]),
        table(
          [c[8], c[9], c[10], '%'],
          tableRows.map(([label, ...values]) => [labels[label] ?? label, ...values])
        )
      ]),
      page(c[11], c[1], [paragraph(c[12]), paragraph(c[13])])
    ]
    return { htmlLang: locale, pages: pages.map((item) => ({ ...item, footerMark: c[17] })) }
  }
  const disclaimer = 'This demo uses fictional data. It is not a real patient or a study result.'
  return {
    htmlLang: 'en',
    pages: [
      page('Fictional sample: 30-day readmission in a synthetic cohort', disclaimer, [
        paragraph(
          'This is a fictional sample for checking the conference-abstract screen. The only input is a synthetic table.'
        ),
        paragraph(
          `Methods: ${stats.n} synthetic rows in resources/demo-readmission/cohort.csv were counted on this computer. No model was called. A row with readmitted_30d of 1 is counted as readmitted.`
        ),
        paragraph(
          `Results: of ${stats.n} synthetic rows, ${stats.events} were marked readmitted (${stats.rate}%).`
        ),
        paragraph('These figures cannot support care or a review decision.')
      ]),
      page('Counts', disclaimer, [
        paragraph('Counts by group. Individual rows are not included.'),
        table(['Group', 'Rows', 'Readmitted', '%'], tableRows)
      ]),
      page('What this sample is', disclaimer, [
        paragraph(
          'The counts were calculated on this computer. They were not sent over the network, and no model was called.'
        ),
        paragraph(
          'Every row has provenance SYNTHETIC. There are no names, chart numbers, or birth dates.'
        )
      ])
    ]
  }
}

export const renderSampleHtml = (document) => {
  const pages = document.pages
    .map((item) => {
      const blocks = item.blocks
        .map((block) => {
          if (block.type === 'p') return `<p>${escapeHtml(block.text)}</p>`
          const head = block.headers.map((cell) => `<th>${escapeHtml(cell)}</th>`).join('')
          const body = block.rows
            .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
            .join('')
          return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
        })
        .join('')
      return `<section class="page"><h1>${escapeHtml(item.title)}</h1><p class="disclaimer">${escapeHtml(item.disclaimer)}</p><div class="body">${blocks}</div><footer><p class="disclaimer">${escapeHtml(item.footerDisclaimer)}</p><p class="mark">${escapeHtml(item.footerMark)}</p></footer></section>`
    })
    .join('')
  return `<!DOCTYPE html><html lang="${escapeHtml(document.htmlLang)}"><head><meta charset="utf-8"><title>${escapeHtml(pages.length ? document.pages[0].title : '')}</title><style>.page{min-height:100vh;display:flex;flex-direction:column;box-sizing:border-box;padding:24px;page-break-after:always}h1{font-size:1.4rem;margin:0 0 8px}.disclaimer{margin:0 0 16px;font-weight:600}.body{flex:1}footer{border-top:1px solid #ccc;margin-top:24px;padding-top:8px;font-size:.85rem}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px;text-align:left}</style></head><body>${pages}</body></html>`
}

export const buildDemoReadmission = () => {
  const rows = buildCohort()
  const stats = summarizeCohort(rows)
  const locales = ['ja', 'zh-Hans', 'zh-Hant', 'en', 'de', 'es', 'fr', 'ko', 'ru']
  const documents = {}
  for (const locale of locales) {
    const document = copyFor(locale, stats)
    const footerMarks = {
      ja: FOOTER_MARK,
      'zh-Hans': 'Baselio 虚构演示',
      'zh-Hant': 'Baselio 虛構示範',
      en: 'Baselio demo'
    }
    if (footerMarks[locale]) {
      document.pages = document.pages.map((item) => ({ ...item, footerMark: footerMarks[locale] }))
    }
    const groupLabels = {
      ja: ['全体', '女性', '男性'],
      'zh-Hans': ['全部', '女性', '男性'],
      'zh-Hant': ['全部', '女性', '男性']
    }[locale]
    if (groupLabels)
      for (const item of document.pages)
        for (const block of item.blocks) {
          if (block.type === 'table')
            block.rows = block.rows.map(([label, ...values]) => [
              { All: groupLabels[0], F: groupLabels[1], M: groupLabels[2] }[label] ?? label,
              ...values
            ])
        }
    documents[locale] = { ...document, html: renderSampleHtml(document) }
  }
  return { seed: SEED, rows, stats, documents }
}

const csvFor = (rows) => {
  const header = 'record_id,provenance,age_band,sex,los_days,readmitted_30d'
  const lines = rows.map(
    (row) =>
      `${row.record_id},${row.provenance},${row.age_band},${row.sex},${row.los_days},${row.readmitted_30d}`
  )
  return `${header}\n${lines.join('\n')}\n`
}

const provenance = `# demo-readmission

## Search before this folder existed

- \`git log --all -- '*readmission*' '*demo-readmission*'\` on this clone returned no commits.
- \`git ls-tree -r --name-only\` for every remote branch returned no path matching \`readmission\` or \`demo-read\`.
- The sentence about a 240-case readmission dataset is only in \`build/prerelease-release-notes.md\`. It was added in commit \`1e5559cecf699f9ea944bf237db007c7d8821069\` ("Add an unsigned internal beta build and offline experience mode."). \`git show --stat\` for that commit lists release notes and prerelease wiring, and no csv, script, or seed.
- No generator and no source table were in the repository. There is no file here that could show derivation from real records, because no records were stored.

## This folder

\`scripts/demo-readmission/generate.mjs\` writes these files. It builds ${ROW_COUNT} rows with mulberry32 seed \`0x${SEED.toString(16)}\`. Every row has \`provenance=SYNTHETIC\` and an id \`SYNTH-####\`. Columns are \`record_id\`, \`provenance\`, \`age_band\`, \`sex\`, \`los_days\`, and \`readmitted_30d\`. There are no names, birth dates, chart numbers, or addresses. Sample-abstract counts are computed from those rows in the same script. The script does not use the network or a model.
`

const writeOutputs = (root) => {
  const built = buildDemoReadmission()
  const resourceDir = join(root, 'resources/demo-readmission')
  const sharedDir = join(root, 'src/shared/demo-readmission')
  mkdirSync(resourceDir, { recursive: true })
  mkdirSync(sharedDir, { recursive: true })
  writeFileSync(join(resourceDir, 'cohort.csv'), csvFor(built.rows))
  writeFileSync(join(resourceDir, 'PROVENANCE.md'), provenance)
  for (const [locale, document] of Object.entries(built.documents)) {
    writeFileSync(join(resourceDir, `abstract.${locale}.html`), document.html)
  }
  const payload = {
    seed: built.seed,
    stats: built.stats,
    documents: built.documents
  }
  const moduleText = `// Generated by scripts/demo-readmission/generate.mjs. Do not edit by hand.\nexport const sampleAbstracts = ${JSON.stringify(payload)} as const\n`
  writeFileSync(join(sharedDir, 'sample-abstracts.ts'), moduleText)
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isDirectRun) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
  writeOutputs(root)
}
