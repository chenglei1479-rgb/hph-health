import { ApplicationPresentationHost } from '@/ApplicationPresentationHost'
import { AccountGate } from '@/components/AccountGate'
import { PrereleaseBanner } from '@/components/PrereleaseBanner'
import { SessionPackageImportError } from '@/components/SessionPackageImportError'
import { SessionPackageOperation } from '@/components/SessionPackageOperation'
import { installRendererPrereleaseLockdown } from '@/lib/prerelease-lockdown'

installRendererPrereleaseLockdown()

const App = (): React.JSX.Element => (
  <>
    <PrereleaseBanner />
    <AccountGate>
      <ApplicationPresentationHost />
      <SessionPackageOperation />
      <SessionPackageImportError />
    </AccountGate>
  </>
)

export default App
