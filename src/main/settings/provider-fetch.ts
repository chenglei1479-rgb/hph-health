import { isSecureProviderUrl, PROVIDER_TRANSPORT_ERROR } from '../../shared/provider-base-url'
import { sendPhiChecked, modelReleaseError, UNSCANNABLE_MODEL_CONTENT_MESSAGE } from '../phi/gate'

// Enforce this at the sending boundary as well as the form: persisted configurations and every
// provider adapter must obey the same policy before credentials or content reach the network.
export const fetchProviderRequest = async (
  fetchImpl: typeof fetch,
  input: string | URL | Request,
  init?: RequestInit
): Promise<Response> => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
  if (!isSecureProviderUrl(url)) throw new Error(PROVIDER_TRANSPORT_ERROR)
  // Provider requests carry credentials; never follow redirects to another selected or unselected URL.
  // Fetch treats undefined dictionary members as absent, including inherited Request options.
  const overrides = Object.fromEntries(
    Object.entries(init ?? {}).filter(([, value]) => value !== undefined)
  ) as RequestInit
  const guarded: RequestInit = {
    ...(input instanceof Request
      ? {
          method: input.method,
          headers: input.headers,
          signal: input.signal,
          credentials: input.credentials,
          cache: input.cache,
          mode: input.mode,
          referrer: input.referrer,
          referrerPolicy: input.referrerPolicy,
          integrity: input.integrity,
          keepalive: input.keepalive
        }
      : {}),
    ...overrides,
    redirect: 'manual'
  }
  if (guarded.headers instanceof Headers) guarded.headers = new Headers(guarded.headers)
  else if (Array.isArray(guarded.headers))
    guarded.headers = guarded.headers.map(([key, value]) => [key, value])
  else if (guarded.headers) guarded.headers = { ...guarded.headers }
  // Request objects can carry an inherited body even when init.body is absent. Never forward
  // that uninspected body. Multipart, media and streaming uploads fail closed in the gate.
  const body =
    init?.body ?? (input instanceof Request && input.body ? await input.clone().text() : undefined)
  if (body != null) {
    if (typeof body !== 'string') throw modelReleaseError(UNSCANNABLE_MODEL_CONTENT_MESSAGE)
    try {
      JSON.parse(body)
    } catch {
      throw modelReleaseError(UNSCANNABLE_MODEL_CONTENT_MESSAGE)
    }
  }
  return sendPhiChecked(body, url.href, (released) => {
    guarded.signal?.throwIfAborted()
    guarded.body = released
    return fetchImpl(url.href, guarded)
  })
}
