// Single source of truth for project identity and external links. Shared by the main process
// (GitHub star-count fetch) and the renderer (every entry-point link). Keep this UI-free — no
// icons, no JSX — so both processes can import it and any screen reuses the same values.
// The visible product name lives in product-identity.ts.

import { PRODUCT_DISPLAY_NAME } from './product-identity'

const GITHUB_OWNER = 'chenglei1479-rgb'
const GITHUB_REPO = 'hph-health'
const GITHUB_REPO_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`
const PRODUCT_RELEASES_URL = `${GITHUB_REPO_URL}/releases`
const CDN_BASE_URL = 'https://statics.aipoch.com/open-science'

export const APP = {
  name: PRODUCT_DISPLAY_NAME,
  brand: {
    name: PRODUCT_DISPLAY_NAME,
    taglineLines: ['AI Research', 'Infrastructure', 'for Medicine']
  },
  tagline: 'AI Research Infrastructure for Medicine',
  githubOwner: GITHUB_OWNER,
  githubRepo: GITHUB_REPO,
  cdnBaseUrl: CDN_BASE_URL,
  links: {
    website: GITHUB_REPO_URL,
    docs: `${GITHUB_REPO_URL}#readme`,
    githubRepo: GITHUB_REPO_URL,
    license: `${GITHUB_REPO_URL}/blob/main/LICENSE`,
    githubReleases: `${GITHUB_REPO_URL}/releases`,
    githubApi: `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`,
    githubIssues: `${GITHUB_REPO_URL}/issues`,
    githubFeedback: `${GITHUB_REPO_URL}/issues/new?template=feature_request.yml`,
    discord: 'https://discord.gg/85dKfuGM9',
    // Placeholder DRA community handle. Replace when the product account exists.
    x: 'https://x.com/dra_ai'
  },
  copyright: `© 2026 ${PRODUCT_DISPLAY_NAME}. Based on AIPOCH Open-Science.`,
  update: {
    // No DRA feed is published yet. Leave this off so a missing deployment file cannot
    // fall back to an upstream updater.
    enabled: false,
    manifestUrl: '',
    downloadPage: PRODUCT_RELEASES_URL
  }
} as const
