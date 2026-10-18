import { isSecureProviderUrl, PROVIDER_TRANSPORT_ERROR } from '../../shared/provider-base-url'
import { guardProviderBody } from '../phi/gate'

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
  const guarded: RequestInit = { ...init, redirect: 'manual' }
  // Request objects can carry an inherited body even when init.body is absent. Never forward
  // that uninspected body. Multipart, media and streaming uploads fail closed in the gate.
  const body =
    init?.body ?? (input instanceof Request && input.body ? await input.clone().text() : undefined)
  guarded.body = await guardProviderBody(body)
  return fetchImpl(input, guarded)
}
