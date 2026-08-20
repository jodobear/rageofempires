import assert from "node:assert/strict";
import test from "node:test";

import type {NostrEvent} from "applesauce-core/helpers/event";

import {BrowserEventAuthor} from "../src/browser-event-author.js";
import type {AuthoredPublication, EventAuthor} from "../src/event-author.js";
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

test("runtime caches partial shell publication and repairs the exact event", async () => {
  const emitted: Array<{channel: BridgeChannel; value: Record<string, unknown>}> = [];
  const transport = new FakeTransport();
  const browserAuthor = new BrowserEventAuthor();
  const event = await browserAuthor.createEvent({
    intent_id: "publish-1",
    kind: MATCH_KIND,
    tags: [["m", "unused"], ["t", APP_TAG], ["v", "1"]],
    content: "{}",
  });
  const repairs: Array<{event: NostrEvent; relays: string[]}> = [];
  const author: EventAuthor = {
    getPublicKey: async () => event.pubkey,
    async createEvent() { throw new Error("standalone path used"); },
    async publishThroughShell(_intent, requested): Promise<AuthoredPublication> {
      return {event, results: [
        {from: requested[0], ok: true},
        {from: requested[1], ok: false},
      ]};
    },
    async republishThroughShell(cached, requested): Promise<AuthoredPublication> {
      repairs.push({event: cached, relays: requested});
      return {event: cached, results: requested.map((from) => ({from, ok: true}))};
    },
  };
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
  await client.publish({
    intent_id: "publish-1",
    kind: MATCH_KIND,
    tags: [["m", client.diagnostics().matchId], ["t", APP_TAG], ["v", "1"]],
    content: "{}",
    cache: true,
  });
  const first = emitted.filter((item) => item.channel === "publish").at(-1)?.value;
  assert.equal(first?.event_id, event.id);
  assert.equal(first?.ok, false);

  await client.republish(event.id);
  assert.equal(repairs.length, 1);
  assert.equal(repairs[0].event, event);
  assert.deepEqual(repairs[0].relays, relays);
  const second = emitted.filter((item) => item.channel === "publish").at(-1)?.value;
  assert.equal(second?.event_id, event.id);
  assert.equal(second?.ok, true);
  client.shutdown();
});
