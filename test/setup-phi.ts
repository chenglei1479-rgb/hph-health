// Production starts closed and installs an encrypted vault after Electron is ready.
// Tests explicitly install the same real de-identification gate with an in-memory vault.
import { createVaultBackedGate, installPhiGate } from '../src/main/phi/gate'
import { createMemoryPhiVault } from '../src/main/phi/store'

installPhiGate(createVaultBackedGate(createMemoryPhiVault()))
