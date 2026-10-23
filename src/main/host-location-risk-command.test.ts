import { expect, it } from 'vitest'

import {
  createApplicationCommandRouter,
  type ApplicationInvocation
} from './application-command-router'
import { createElectronCallerContext } from './caller-context'
import {
  hostApplicationCommands,
  registerHostApplicationCommands,
  type HostApplicationCommandDependencies
} from './host-application-commands'

const invocation = (path: string): ApplicationInvocation<readonly [string]> => {
  const callerContext = createElectronCallerContext(7)
  return {
    args: [path],
    callerContext,
    callerLease: {
      leaseId: callerContext.leaseId,
      generation: 1,
      signal: new AbortController().signal,
      isCurrent: () => true
    }
  }
}

it('dispatches the location-risk probe through the packaged backend command composition', async () => {
  const router = createApplicationCommandRouter()
  const installation = registerHostApplicationCommands(
    router.registrar,
    {} as HostApplicationCommandDependencies
  )
  try {
    await expect(
      router.dispatcher.invoke(
        hostApplicationCommands.storage.getLocationRisk,
        invocation('/tmp/Dropbox/research')
      )
    ).resolves.toEqual({ kind: 'cloud-sync', provider: 'Dropbox' })
    await expect(
      router.dispatcher.invoke(
        hostApplicationCommands.storage.getLocationRisk,
        invocation(null as unknown as string)
      )
    ).resolves.toEqual({ kind: 'unknown' })
  } finally {
    installation.uninstall()
  }
})
