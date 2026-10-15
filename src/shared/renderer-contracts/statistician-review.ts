import type {
  StatisticianReviewExportRequest,
  StatisticianReviewExportResponse
} from '../statistician-review-export'
import { callable, LOCAL } from './definition'

export const contracts = {
  'statisticianReview.exportPackage': callable<
    (request: StatisticianReviewExportRequest) => Promise<StatisticianReviewExportResponse>
  >()('statistician-review', ['statistician-review:export-package', LOCAL])
} as const
