import { expect, it } from 'vitest'

import { externalEndpointEntries, userConfiguredModelEntry } from '../src/shared/external-endpoints'
import { collectOutboundHosts, isModelCatalogHost } from './external-endpoint-hosts'

it('fails when production code introduces a host that is not in the endpoint catalog', () => {
  const staticHosts = new Set(
    externalEndpointEntries().flatMap((entry) => (entry.host ? [entry.host.toLowerCase()] : []))
  )
  const examples = new Set(
    (userConfiguredModelEntry().exampleHosts ?? []).map((host) => host.toLowerCase())
  )
  const missingStatic: string[] = []
  const missingExamples: string[] = []
  for (const hit of collectOutboundHosts(process.cwd())) {
    if (isModelCatalogHost(hit)) {
      if (!examples.has(hit.host) && !staticHosts.has(hit.host)) missingExamples.push(hit.host)
      continue
    }
    if (!staticHosts.has(hit.host)) missingStatic.push(`${hit.host} (${hit.files[0]})`)
  }
  expect(missingStatic).toEqual([])
  expect(missingExamples).toEqual([])
})
