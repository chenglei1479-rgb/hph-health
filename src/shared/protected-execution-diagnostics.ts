// Stable, content-free classification for Windows protected-execution failures.
//
// The native host reports ACL failures such as `WINDOWS_ACL_ACCESS_DENIED: write command ACL`, and
// the probe wraps every failure into `Windows runtime is incompatible with protected execution.`
// Both must reach the doctor as one actionable diagnostic instead of a raw internal exception.
export const PROTECTED_EXECUTION_UNAVAILABLE_CODE = 'WIN-PROTECTED-EXEC-01'

const PROTECTED_EXECUTION_FAILURE =
  /windows runtime is incompatible with protected execution|WINDOWS_ACL_ACCESS_DENIED|write command ACL|grant AppContainer access to/iu

export const isProtectedExecutionUnavailableMessage = (message: string): boolean =>
  PROTECTED_EXECUTION_FAILURE.test(message)
