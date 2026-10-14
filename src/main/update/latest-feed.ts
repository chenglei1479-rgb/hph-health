import { parseLatestYml, type LatestYmlFeed } from '../../shared/signed-update-channel'

export const fetchLatestYml = async (
  feedUrl: string,
  fetchImpl: typeof fetch = fetch
): Promise<LatestYmlFeed> => {
  const base = feedUrl.endsWith('/') ? feedUrl : `${feedUrl}/`
  const url = new URL('latest.yml', base)
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('Update feed must use HTTPS.')
  }
  const response = await fetchImpl(url)
  if (!response.ok) throw new Error('Update feed was not available.')
  return parseLatestYml(await response.text())
}
