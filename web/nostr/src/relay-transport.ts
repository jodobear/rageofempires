import type {NostrEvent} from "applesauce-core/helpers/event";

export type NostrFilter = {
  ids?: string[];
  authors?: string[];
  kinds?: number[];
  since?: number;
  until?: number;
  limit?: number;
  search?: string;
  [tag: `#${string}`]: string[] | undefined;
};

export type RelayStatus = {
  connected: boolean;
  ready: boolean;
  authRequiredForRead: boolean;
  authRequiredForPublish: boolean;
};

export type RelayMessage =
  | {type: "OPEN"; from: string}
  | {type: "EOSE"; from: string}
  | {type: "CLOSED"; from: string; reason: string}
  | {type: "ERROR"; from: string; error: unknown}
  | {type: "EVENT"; from: string; event: NostrEvent};

export type PublishResponse = {
  from: string;
  ok: boolean;
  message?: string;
};

export type TransportSubscription = {
  unsubscribe(): void;
};

export interface RelayTransport {
  observeStatus(
    next: (statuses: Record<string, RelayStatus>) => void,
    error: (error: unknown) => void,
  ): TransportSubscription;
  subscribe(
    relay: string,
    filters: NostrFilter[],
    next: (message: RelayMessage) => void,
    error: (error: unknown) => void,
  ): TransportSubscription;
  publish(relay: string, event: NostrEvent): Promise<PublishResponse[]>;
  remove(relay: string): void;
  close(): void;
}

export type RelayTransportFactory = () => RelayTransport;
