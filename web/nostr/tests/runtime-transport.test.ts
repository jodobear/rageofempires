import assert from "node:assert/strict";
import test from "node:test";

import type {NostrEvent} from "applesauce-core/helpers/event";

import {BrowserEventAuthor} from "../src/browser-event-author.js";
import {APP_TAG, MATCH_KIND} from "../src/protocol.js";
import type {
  NostrFilter,
  PublishResponse,
  RelayMessage,
  RelayStatus,
  RelayTransport,
  TransportSubscription,
} from "../src/relay-transport.js";
import {AoeNostrClient, type BridgeChannel} from "../src/runtime.js";

const relays = ["wss://one.example/", "wss://two.example/"];

class FakeTransport implements RelayTransport {
  readonly sinks = new Map<string, (message: RelayMessage) => void>();
  private statusSink: ((statuses: Record<string, RelayStatus>) => void) | undefined;

  observeStatus(
    next: (statuses: Record<string, RelayStatus>) => void,
    _error: (error: unknown) => void,
  ): TransportSubscription {
    this.statusSink = next;
    return {unsubscribe: () => { this.statusSink = undefined; }};
  }

  subscribe(
    relay: string,
    _filters: NostrFilter[],
    next: (message: RelayMessage) => void,
    _error: (error: unknown) => void,
  ): TransportSubscription {
    this.sinks.set(relay, next);
    return {unsubscribe: () => this.sinks.delete(relay)};
  }

  publish(_relay: string, _event: NostrEvent): Promise<PublishResponse[]> {
    return Promise.resolve([]);
  }

  remove(relay: string): void {
    this.sinks.delete(relay);
  }

  close(): void {
    this.sinks.clear();
  }

  ready(): void {
    this.statusSink?.(Object.fromEntries(relays.map((relay) => [relay, {
      connected: true,
      ready: true,
      authRequiredForRead: false,
      authRequiredForPublish: false,
    }])));
  }
}

test("runtime deduplicates bridge delivery but preserves per-relay observation", async () => {
  const emitted: Array<{channel: BridgeChannel; value: Record<string, unknown>}> = [];
  const transport = new FakeTransport();
  const author = new BrowserEventAuthor();
  const client = new AoeNostrClient(
    (channel, json) => emitted.push({channel, value: JSON.parse(json)}),
    () => author,
    () => transport,
  );
  await client.initialize({
    role: "host",
    relays,
    one_relay_development: false,
    compatibility_digest: "compatible",
  });
  transport.ready();
  const matchId = client.diagnostics().matchId;
  const event = await author.createEvent({
    intent_id: "event-1",
    kind: MATCH_KIND,
    tags: [["m", matchId], ["t", APP_TAG], ["v", "1"]],
    content: "{}",
  });
  for (const relay of relays) {
    transport.sinks.get(relay)?.({type: "EVENT", from: relay, event});
  }

  assert.equal(emitted.filter((item) => item.channel === "event").length, 1);
  assert.deepEqual(
    emitted.filter((item) => item.value.type === "event_observed")
      .map((item) => item.value.relay),
    relays,
  );
  client.shutdown();
});
