import type { UpdateStatus } from '../../shared/update'
import type { UpdateStrategy } from './strategy'

// No updater construction, network requests, download, or installer handoff in this build.
export class DisabledUpdateStrategy implements UpdateStrategy {
  constructor(private readonly current: string) {}

  getStatus(): UpdateStatus {
    return { state: 'disabled', current: this.current }
  }

  async check(): Promise<UpdateStatus> {
    return this.getStatus()
  }
  async download(): Promise<UpdateStatus> {
    return this.getStatus()
  }
  async cancel(): Promise<UpdateStatus> {
    return this.getStatus()
  }
  async apply(): Promise<UpdateStatus> {
    return this.getStatus()
  }
}
