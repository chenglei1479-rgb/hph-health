// Single source of truth for project identity and external links. Shared by the main process
// (GitHub star-count fetch) and the renderer (every entry-point link). Keep this UI-free — no
// icons, no JSX — so both processes can import it and any screen reuses the same values.

const GITHUB_OWNER = 'chenglei1479-rgb'
const GITHUB_REPO = 'hph-health'
const GITHUB_REPO_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`
const PRODUCT_RELEASES_URL = `${GITHUB_REPO_URL}/releases`

export const APP = {
  name: 'MedResearch Agent',
  githubOwner: GITHUB_OWNER,
  githubRepo: GITHUB_REPO,
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
    x: 'https://x.com/aipoch_ai'
  },
  copyright: '© 2026 AIPOCH. All rights reserved.',
  update: {
    manifestUrl: 'https://statics.aipoch.com/medical-research-agent/app/stable/version.json',
    downloadPage: PRODUCT_RELEASES_URL
  }
} as const
