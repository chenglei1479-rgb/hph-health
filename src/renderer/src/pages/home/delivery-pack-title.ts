import type { DeliveryPackId } from '../../../../shared/deliverable-next-step'

type Translate = (key: string) => string

export const deliveryPackTitle = (t: Translate, id: DeliveryPackId): string => {
  switch (id) {
    case 'mentor-pack':
      return t('Mentor discussion pack')
    case 'consultation-pack':
      return t('Data audit and statistical consultation pack')
    case 'writing-pack':
      return t('Conference abstract or English draft')
    case 'statistician-export':
      return t('Aggregate statistics export')
    case 'analysis':
      return t('Data analysis')
  }
}

export const unreleasedDestinationTitle = (
  t: Translate,
  id: 'ethics-application' | 'slides-poster'
): string => {
  if (id === 'ethics-application') return t('Ethics application documents')
  return t('Slides and poster')
}
