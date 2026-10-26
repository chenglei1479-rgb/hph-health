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
}

export const homePrimaryEntries = (t: Translate): HomePrimaryEntry[] => [
  {
    id: 'mentor-prep',
    workflow: 'mentor-pack',
    title: t('Prepare to consult your supervising doctor'),
    subtitle: t('A one-page brief for a mentor meeting, focused on study-design consultation.'),
    description: t('Prepare your question and study design for a mentor meeting.'),
    hardRule: t('This pack does not load patient data.')
  },
  {
    id: 'analyze-data',
    workflow: 'analysis',
    title: t('Analyze your own data'),
    subtitle: t(
      'Upload an anonymized CSV, inspect variables and missingness, confirm a statistical plan, then run reproducible analysis.'
    ),
    description: t('Review a statistical plan, then create tables, figures, and code.'),
    hardRule: t('Use fictional or de-identified tables only.')
  },
  {
    id: 'write-abstract',
    workflow: 'writing-pack',
    title: t('Prepare a conference abstract or paper'),
    subtitle: t('A short manuscript for a deadline, with checks for the ethics number and AI use.'),
    description: t('Draft a conference abstract or short paper for review.'),
    hardRule: t('A missing ethics number is a reminder and does not block writing.')
  }
]
