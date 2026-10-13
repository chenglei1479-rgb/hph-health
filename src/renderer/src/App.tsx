import { ApplicationPresentationHost } from '@/ApplicationPresentationHost'
import { AccountGate } from '@/components/AccountGate'
import { SessionPackageImportError } from '@/components/SessionPackageImportError'
import { SessionPackageOperation } from '@/components/SessionPackageOperation'

const App = (): React.JSX.Element => (
  <AccountGate>
    <ApplicationPresentationHost />
    <SessionPackageOperation />
    <SessionPackageImportError />
  </AccountGate>
)

export default App
