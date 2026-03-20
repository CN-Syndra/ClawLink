import { logger } from '../utils/logger';
import {
  getDeferredRestartAction,
  shouldDeferRestart,
  type GatewayLifecycleState,
} from './process-policy';

type RestartDeferralState = {
  state: GatewayLifecycleState;
  startLock: boolean;
};

type DeferredRestartContext = RestartDeferralState & {
  shouldReconnect: boolean;
};

export class GatewayRestartController {
  private deferredRestartPending = false;
  private restartDebounceTimer: NodeJS.Timeout | null = null;

  isRestartDeferred(context: RestartDeferralState): boolean {
    return shouldDeferRestart(context);
  }

  markDeferredRestart(reason: string, context: RestartDeferralState): void {
    if (!this.deferredRestartPending) {
      logger.info(
        `Deferring Gateway restart (${reason}) until startup/reconnect settles (state=${context.state}, startLock=${context.startLock})`,
      );
    } else {
      logger.debug(
        `Gateway restart already deferred; keeping pending request (${reason}, state=${context.state}, startLock=${context.startLock})`,
      );
    }
    this.deferredRestartPending = true;
  }

  flushDeferredRestart(
    trigger: string,
    context: DeferredRestartContext,
    executeRestart: () => void,
  ): void {
    const action = getDeferredRestartAction({
      hasPendingRestart: this.deferredRestartPending,
      state: context.state,
      startLock: context.startLock,
      shouldReconnect: context.shouldReconnect,
    });

    if (action === 'none') return;
    if (action === 'wait') {
      logger.debug(
        `Deferred Gateway restart still waiting (${trigger}, state=${context.state}, startLock=${context.startLock})`,
      );
      return;
    }

    this.deferredRestartPending = false;
    if (action === 'drop') {
      logger.info(
        `Dropping deferred Gateway restart (${trigger}) because lifecycle already recovered (state=${context.state}, shouldReconnect=${context.shouldReconnect})`,
      );
      return;
    }

    logger.info(`Executing deferred Gateway restart now (${trigger})`);
    executeRestart();
  }

  debouncedRestart(delayMs: number, executeRestart: () => void): void {
    if (this.restartDebounceTimer) {
      clearTimeout(this.restartDebounceTimer);
    }
    logger.debug(`Gateway restart debounced (will fire in ${delayMs}ms)`);
    this.restartDebounceTimer = setTimeout(() => {
      this.restartDebounceTimer = null;
      executeRestart();
    }, delayMs);
  }

  clearDebounceTimer(): void {
    if (this.restartDebounceTimer) {
      clearTimeout(this.restartDebounceTimer);
      this.restartDebounceTimer = null;
    }
  }

  resetDeferredRestart(): void {
    this.deferredRestartPending = false;
  }
}
