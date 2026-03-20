import { logger } from '../utils/logger';
import { isLifecycleSuperseded, nextLifecycleEpoch } from './process-policy';

export class LifecycleSupersededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LifecycleSupersededError';
  }
}

export class GatewayLifecycleController {
  private epoch = 0;

  getCurrentEpoch(): number {
    return this.epoch;
  }

  bump(reason: string): number {
    this.epoch = nextLifecycleEpoch(this.epoch);
    logger.debug(`Gateway lifecycle epoch advanced to ${this.epoch} (${reason})`);
    return this.epoch;
  }

  assert(expectedEpoch: number, phase: string): void {
    if (isLifecycleSuperseded(expectedEpoch, this.epoch)) {
      throw new LifecycleSupersededError(
        `Gateway ${phase} superseded (expectedEpoch=${expectedEpoch}, currentEpoch=${this.epoch})`,
      );
    }
  }
}
