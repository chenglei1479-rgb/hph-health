import type { TFunction } from 'i18next'
import type { SeedKeyMode } from '../../../../shared/seed-invite'

// The home "Details" disclosure (詳しく) lists every download destination in user language. Hosts
// are part of the English source key so a renamed host cannot silently disappear from the UI.
export const homeExternalDestinationLines = (
  t: TFunction,
  mode: SeedKeyMode = 'none'
): string[] => [
  mode === 'company'
    ? t('The AI contracted by the operator (OpenAI in the beta)')
    : mode === 'byok'
      ? t('The provider you registered')
      : t('No AI provider is configured'),
  t(
    "Runtime and marketplace downloads can contact statics.aipoch.com (the distributor's static host). A build without a configured runtime CDN makes no such request and shows a notice instead."
  ),
  t(
    'Package installs can contact conda.anaconda.org (conda-forge and bioconda), pypi.org, and cloud.r-project.org. Mainland mirrors (mirrors.tuna.tsinghua.edu.cn, mirrors.ustc.edu.cn, mirrors.aliyun.com) are probed only when the app language is Simplified Chinese.'
  ),
  t(
    'Managed CLI installs can contact registry.npmjs.org, with registry.npmmirror.com as a fallback.'
  ),
  t(
    'Official Skill and Specialist marketplaces can contact github.com, api.github.com, and raw.githubusercontent.com. They stay on by default in this beta and can be turned off.'
  ),
  t('No telemetry is sent. Auto-update is off.')
]
