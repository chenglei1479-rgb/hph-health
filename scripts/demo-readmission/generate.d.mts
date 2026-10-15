export type DemoCohortRow = {
  record_id: string
  provenance: 'SYNTHETIC'
  age_band: string
  sex: 'F' | 'M'
  los_days: number
  readmitted_30d: 0 | 1
}

export type DemoAbstractPage = {
  title: string
  disclaimer: string
  blocks: ReadonlyArray<{ type: string; text?: string; headers?: string[]; rows?: string[][] }>
  footerDisclaimer: string
  footerMark: string
}

export type DemoAbstractDocument = {
  htmlLang: string
  pages: DemoAbstractPage[]
  html: string
}

export type DemoReadmissionBuild = {
  seed: number
  rows: DemoCohortRow[]
  stats: {
    n: number
    events: number
    rate: string
  }
  documents: {
    ja: DemoAbstractDocument
    'zh-Hans': DemoAbstractDocument
    'zh-Hant': DemoAbstractDocument
    en: DemoAbstractDocument
  }
}

export function buildCohort(): DemoCohortRow[]
export function buildDemoReadmission(): DemoReadmissionBuild
