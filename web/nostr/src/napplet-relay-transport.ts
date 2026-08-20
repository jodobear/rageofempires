import type {NostrEvent} from "applesauce-core/helpers/event";

import type {
  NappletOutboxCapability,
  NappletOutboxListener,
  NappletOutboxSubscription,
} from "./napplet-api.js";
import {validateRelay, validHex64} from "./protocol.js";
import type {
  NostrFilter,
  PublishResponse,
  RelayMessage,
  RelayStatus,
  RelayTransport,
  TransportSubscription,
} from "./relay-transport.js";

const QUERY_TIMEOUT_MS = 15000;

type RelayEventResult = {
  event: NostrEvent;
  sidecar?: {relayHints?: string[]};
};

type QueryResult = {
  events: RelayEventResult[];
  incomplete: boolean;
  error?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNostrEvent(value: unknown): value is NostrEvent {
  if (!isRecord(value) || typeof value.id !== "string" ||
      typeof value.pubkey !== "string" || typeof value.sig !== "string" ||
      typeof value.content !== "string" || !Number.isSafeInteger(value.kind) ||
      !Number.isSafeInteger(value.created_at) || !validHex64(value.id) ||
      !validHex64(value.pubkey) || !/^[0-9a-f]{128}$/.test(value.sig)) {
    return false;
  }
  return Array.isArray(value.tags) && value.tags.every((tag) =>
    Array.isArray(tag) && tag.every((part) => typeof part === "string")
  );
}

function parseRelayEventResult(value: unknown): RelayEventResult {
  if (!isRecord(value) || !isNostrEvent(value.event)) {
    throw new Error("napplet outbox returned an invalid event result");
  }
  if (value.sidecar === undefined) return {event: value.event};
  if (!isRecord(value.sidecar) ||
      (value.sidecar.relayHints !== undefined &&
       (!Array.isArray(value.sidecar.relayHints) ||
        !value.sidecar.relayHints.every((hint) => typeof hint === "string")))) {
    throw new Error("napplet outbox returned invalid relay hints");
  }
  return {
    event: value.event,
    sidecar: value.sidecar.relayHints === undefined ? undefined : {
      relayHints: value.sidecar.relayHints as string[],
    },
  };
}

function parseQueryResult(value: unknown): QueryResult {
  if (!isRecord(value) || value.type !== "outbox.query.result" ||
      !Array.isArray(value.events) ||
      (value.incomplete !== undefined && typeof value.incomplete !== "boolean") ||
      (value.error !== undefined && typeof value.error !== "string")) {
    throw new Error("napplet outbox returned an invalid query result");
  }
  return {
    events: value.events.map(parseRelayEventResult),
    incomplete: value.incomplete === true,
    ...(typeof value.error === "string" && value.error.length > 0
      ? {error: value.error} : {}),
  };
}

function withoutRoutingAuthors(filters: NostrFilter[]): NostrFilter[] {
  return filters.map((filter) => {
    const {authors: _authors, ...rest} = filter;
    return rest;
  });
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value as string[] : undefined;
}

export function eventMatchesFilters(
  event: NostrEvent,
  filters: NostrFilter[],
): boolean {
  return filters.some((filter) => {
    const kinds = Array.isArray(filter.kinds) ? filter.kinds : undefined;
    if (kinds && !kinds.includes(event.kind)) return false;
    const authors = stringArray(filter.authors);
    if (authors && !authors.some((author) => event.pubkey.startsWith(author))) return false;
    const ids = stringArray(filter.ids);
    if (ids && !ids.some((id) => event.id.startsWith(id))) return false;
    if (typeof filter.since === "number" && event.created_at < filter.since) return false;
    if (typeof filter.until === "number" && event.created_at > filter.until) return false;
    for (const [key, untrustedValues] of Object.entries(filter)) {
      if (!key.startsWith("#")) continue;
      const values = stringArray(untrustedValues);
      if (!values) return false;
      const tagName = key.slice(1);
      if (!event.tags.some((tag) => tag[0] === tagName && values.includes(tag[1]))) {
        return false;
      }
    }
    return true;
  });
}

function resultObservedOn(result: RelayEventResult, relay: string): boolean {
  return result.sidecar?.relayHints?.some((hint) => {
    try {
      return validateRelay(hint) === relay;
    } catch (_) {
      return false;
    }
  }) === true;
}

export class NappletRelayTransport implements RelayTransport {
  private readonly statusListeners = new Set<(
    statuses: Record<string, RelayStatus>,
  ) => void>();
  private readonly statuses = new Map<string, RelayStatus>();
  private readonly closeSubscriptions = new Set<() => void>();
  private closed = false;

  constructor(
    private readonly outbox: NappletOutboxCapability | undefined =
      globalThis.napplet?.outbox,
  ) {
    if (!outbox) throw new Error("napplet outbox capability is unavailable");
  }

  observeStatus(
    next: (statuses: Record<string, RelayStatus>) => void,
    _error: (error: unknown) => void,
  ): TransportSubscription {
    this.statusListeners.add(next);
    next(Object.fromEntries(this.statuses));
    return {unsubscribe: () => this.statusListeners.delete(next)};
  }

  private updateStatus(relay: string, available: boolean): void {
    this.statuses.set(relay, {
      connected: available,
      ready: available,
      authRequiredForRead: false,
      authRequiredForPublish: false,
    });
    const snapshot = Object.fromEntries(this.statuses);
    for (const listener of this.statusListeners) listener(snapshot);
  }

  subscribe(
    relay: string,
    filters: NostrFilter[],
    next: (message: RelayMessage) => void,
    error: (error: unknown) => void,
  ): TransportSubscription {
    if (this.closed) throw new Error("napplet relay transport is closed");
    const outbox = this.outbox;
    if (!outbox) throw new Error("napplet outbox capability is unavailable");
    const wireFilters = withoutRoutingAuthors(filters);
    const options = {relays: [relay], authors: [], timeoutMs: QUERY_TIMEOUT_MS};
    let active = true;
    let live: NappletOutboxSubscription | undefined;
    const listeners: NappletOutboxListener[] = [];

    const deliver = (value: unknown): boolean => {
      try {
        const result = parseRelayEventResult(value);
        if (!resultObservedOn(result, relay)) {
          throw new Error(`napplet outbox event lacks requested relay hint: ${relay}`);
        }
        if (!eventMatchesFilters(result.event, filters)) return true;
        next({type: "EVENT", from: relay, event: result.event});
        return true;
      } catch (cause) {
        this.updateStatus(relay, false);
        next({type: "ERROR", from: relay, error: cause});
        error(cause);
        return false;
      }
    };

    const openLive = (): void => {
      if (!active || this.closed) return;
      try {
        live = outbox.subscribe(wireFilters, options);
        listeners.push(live.on("event", (value) => {
          if (active && !this.closed) deliver(value);
        }));
        listeners.push(live.on("closed", (reason) => {
          if (!active || this.closed) return;
          this.updateStatus(relay, false);
          next({type: "CLOSED", from: relay, reason: String(reason ?? "")});
        }));
      } catch (cause) {
        this.updateStatus(relay, false);
        next({type: "ERROR", from: relay, error: cause});
        error(cause);
      }
    };

    next({type: "OPEN", from: relay});
    void outbox.query(wireFilters, options).then((value) => {
      if (!active || this.closed) return;
      const result = parseQueryResult(value);
      const valid = result.events.every(deliver);
      if (!valid || result.incomplete || result.error) {
        if (!valid) return;
        const cause = new Error(result.error ?? "napplet outbox query incomplete");
        this.updateStatus(relay, false);
        next({type: "ERROR", from: relay, error: cause});
        error(cause);
        return;
      }
      this.updateStatus(relay, true);
      next({type: "EOSE", from: relay});
    }).catch((cause: unknown) => {
      if (!active || this.closed) return;
      this.updateStatus(relay, false);
      next({type: "ERROR", from: relay, error: cause});
      error(cause);
    }).finally(openLive);

    const unsubscribe = (): void => {
      if (!active) return;
      active = false;
      for (const listener of listeners.splice(0)) listener.close();
      live?.close();
      this.closeSubscriptions.delete(unsubscribe);
    };
    this.closeSubscriptions.add(unsubscribe);
    return {unsubscribe};
  }

  async publish(_relay: string, _event: NostrEvent): Promise<PublishResponse[]> {
    throw new Error("napplet publication requires the shell outbox adapter");
  }

  remove(relay: string): void {
    this.statuses.delete(relay);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const close of [...this.closeSubscriptions]) close();
    this.closeSubscriptions.clear();
    this.statusListeners.clear();
    this.statuses.clear();
  }
}
