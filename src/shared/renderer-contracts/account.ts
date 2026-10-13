import type { AccountLoginRequest, AccountState, NotebookAccessCheck } from '../account'
import { callable, ELECTRON } from './definition'
export const contracts = {
  'account.checkNotebookAccess': callable<() => Promise<NotebookAccessCheck>>()(
    'account',
    ['account:check-notebook-access', ELECTRON],
    { optionalRoot: true, optionalMember: true }
  ),
  'account.getState': callable<() => Promise<AccountState>>()(
    'account',
    ['account:state', ELECTRON],
    { optionalRoot: true }
  ),
  'account.login': callable<(request: AccountLoginRequest) => Promise<AccountState>>()(
    'account',
    ['account:login', ELECTRON],
    { optionalRoot: true }
  ),
  'account.logout': callable<() => Promise<AccountState>>()(
    'account',
    ['account:logout', ELECTRON],
    { optionalRoot: true }
  )
} as const
