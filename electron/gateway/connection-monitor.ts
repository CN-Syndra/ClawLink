import { logger } from '../utils/logger';

type HealthResult = { ok: boolean; error?: string };

export class GatewayConnectionMonitor {
  private pingInterval: NodeJS.Timeout | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  startPing(sendPing: () => void, intervalMs = 30000): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    this.pingInterval = setInterval(() => {
      sendPing();
    }, intervalMs);
  }

  startHealthCheck(options: {
    shouldCheck: () => boolean;
    checkHealth: () => Promise<HealthResult>;
    onUnhealthy: (errorMessage: string) => void;
    onError: (error: unknown) => void;
    intervalMs?: number;
  }): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      if (!options.shouldCheck()) {
        return;
      }

      try {
        const health = await options.checkHealth();
        if (!health.ok) {
          const errorMessage = health.error ?? 'Health check failed';
          logger.warn(`Gateway health check failed: ${errorMessage}`);
          options.onUnhealthy(errorMessage);
        }
      } catch (error) {
        logger.error('Gateway health check error:', error);
        options.onError(error);
      }
    }, options.intervalMs ?? 30000);
  }

  clear(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }
}
