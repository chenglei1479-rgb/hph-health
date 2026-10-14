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
  if (init?.body != null) guarded.body = await guardProviderBody(init.body)
  return fetchImpl(input, guarded)
}
