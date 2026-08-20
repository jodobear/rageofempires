import type {NostrEvent} from "applesauce-core/helpers/event";
import {RelayPool} from "applesauce-relay";
import type {GroupReqMessage, RelayStatus as ApplesauceRelayStatus} from "applesauce-relay/types";

import type {
  NostrFilter,
  PublishResponse,
  RelayMessage,
  RelayStatus,
  RelayTransport,
  TransportSubscription,
} from "./relay-transport.js";

export class BrowserRelayTransport implements RelayTransport {
  private readonly pool = new RelayPool();

  observeStatus(
    next: (statuses: Record<string, RelayStatus>) => void,
    error: (error: unknown) => void,
  ): TransportSubscription {
    return this.pool.status$.subscribe({
      next: (statuses: Record<string, ApplesauceRelayStatus>) => next(statuses),
      error,
    });
  }

  subscribe(
    relay: string,
    filters: NostrFilter[],
    next: (message: RelayMessage) => void,
    error: (error: unknown) => void,
  ): TransportSubscription {
    return this.pool.req([relay], filters, {
      waitForAuth: false,
      resubscribe: true,
      reconnect: true,
    }).subscribe({
      next: (message: GroupReqMessage) => next(message),
      error,
    });
  }

  publish(relay: string, event: NostrEvent): Promise<PublishResponse[]> {
    return this.pool.publish([relay], event, {
      reconnect: true,
      retries: false,
      timeout: 15000,
    });
  }

  remove(relay: string): void {
    this.pool.remove(relay, true);
  }

  close(): void {
    this.pool.close();
  }
}
