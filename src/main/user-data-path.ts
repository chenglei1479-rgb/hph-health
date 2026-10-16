let readUserDataPath = (): string => {
  const explicit = process.env.OPEN_SCIENCE_USER_DATA?.trim()
  if (explicit) return explicit
  throw new Error('User data path is not configured.')
}

// The Electron shell and the Node backend install their own directory. Callers must not import Electron.
export const configureUserDataPath = (read: () => string): void => {
  readUserDataPath = read
}

export const getUserDataPath = (): string => readUserDataPath()
