// Home primary entries for beta.10. Order is part of the product: mentor prep,
// then data analysis, then abstract or paper. Statistician export is not a home entry.

export const HOME_PRIMARY_ENTRY_IDS = ['mentor-prep', 'analyze-data', 'write-abstract'] as const

export type HomePrimaryEntryId = (typeof HOME_PRIMARY_ENTRY_IDS)[number]

type Translate = (key: string) => string

export type HomePrimaryEntry = {
  id: HomePrimaryEntryId
  workflow: 'mentor-pack' | 'analysis' | 'writing-pack'
  title: string
  subtitle: string
  description: string
  hardRule?: string
  inputNotice?: string
}

export const homePrimaryEntries = (t: Translate): HomePrimaryEntry[] => [
  {
    id: 'mentor-prep',
    workflow: 'mentor-pack',
    title: t('Prepare to consult your supervising doctor'),
    subtitle: t('A one-page brief for a mentor meeting, focused on study-design consultation.'),
    description: t(
      'For discussion before ethics review: the research question, the design, and what to confirm with your mentor next. An approval number is not required. For data analysis, start from "Analyze your own data".'
    ),
    hardRule: t('This pack does not load patient data.'),
    inputNotice: t(
      'Do not paste individual patient data. Keep the consultation to the study design and a summary of aggregate results.'
    )
  },
  {
    id: 'analyze-data',
    workflow: 'analysis',
    title: t('Analyze your own data'),
    subtitle: t(
      'Upload an anonymized CSV, inspect variables and missingness, confirm a statistical plan, then run reproducible analysis.'
    ),
    description: t(
      'Upload an anonymized CSV, review variables and missingness, approve a statistical plan, then create reproducible tables, figures, and code.'
    )
  },
  {
    id: 'write-abstract',
    workflow: 'writing-pack',
    title: t('Prepare a conference abstract or paper'),
    subtitle: t('A short manuscript for a deadline, with checks for the ethics number and AI use.'),
    description: t(
      'This pack ends at a conference abstract or a short English draft. Continue a long paper from Manuscript writing or Academic English writing. Before writing, the ethics approval number is checked. A missing number is only a reminder and does not block writing.'
    )
  }
]
