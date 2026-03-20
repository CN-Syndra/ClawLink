import type { ServerResponse } from 'http';

type EventPayload = unknown;

export class HostEventBus {
  private readonly clients = new Set<ServerResponse>();

  addSseClient(res: ServerResponse): void {
    this.clients.add(res);
    res.on('close', () => {
      this.clients.delete(res);
    });
  }

  emit(eventName: string, payload: EventPayload): void {
    const message = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const client of this.clients) {
      try {
        client.write(message);
      } catch {
        this.clients.delete(client);
      }
    }
  }

  closeAll(): void {
    for (const client of this.clients) {
      try {
        client.end();
      } catch {
        // Ignore individual client close failures.
      }
    }
    this.clients.clear();
  }
}
