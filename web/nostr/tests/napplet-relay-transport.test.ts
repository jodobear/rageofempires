import assert from "node:assert/strict";
import test from "node:test";

import type {NostrEvent} from "applesauce-core/helpers/event";

import type {
  NappletOutboxCapability,
  NappletOutboxSubscription,
} from "../src/napplet-api.js";
import {
  eventMatchesFilters,
  NappletRelayTransport,
} from "../src/napplet-relay-transport.js";
import type {RelayMessage, RelayStatus} from "../src/relay-transport.js";

const relay = "wss://one.example/";
const host = "a".repeat(64);
const event: NostrEvent = {
  id: "b".repeat(64),
  pubkey: host,
  kind: 78,
  created_at: 5000,
  tags: [["m", "match"]],
  content: "{}",
  sig: "c".repeat(128),
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((accept, deny) => {
    resolve = accept;
    reject = deny;
  });
  return {promise, resolve, reject};
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

class MockSubscription implements NappletOutboxSubscription {
  readonly handlers = {
    event: new Set<(value?: unknown) => void>(),
    closed: new Set<(value?: unknown) => void>(),
  };
  closed = false;

  on(
    name: "event" | "closed",
    handler: (value?: unknown) => void,
  ) {
    this.handlers[name].add(handler);
    return {close: () => this.handlers[name].delete(handler)};
  }

  emit(name: "event" | "closed", value?: unknown): void {
    for (const handler of this.handlers[name]) handler(value);
  }

  close(): void {
    this.closed = true;
  }
}

test("napplet receive queries one explicit relay before opening live delivery", async () => {
  const query = deferred<unknown>();
  const queries: Array<{filters: unknown; options?: Record<string, unknown>}> = [];
  const subscriptions: Array<{
    filters: unknown;
    options?: Record<string, unknown>;
    handle: MockSubscription;
  }> = [];
  const outbox: NappletOutboxCapability = {
    query(filters, options) {
      queries.push({filters, options});
      return query.promise;
    },
    subscribe(filters, options) {
      const handle = new MockSubscription();
      subscriptions.push({filters, options, handle});
      return handle;
    },
  };
  const transport = new NappletRelayTransport(outbox);
  const messages: RelayMessage[] = [];
  const statuses: Array<Record<string, RelayStatus>> = [];
  transport.observeStatus((status) => statuses.push(status), () => {});
  const handle = transport.subscribe(
    relay,
    [{kinds: [78], authors: [host], "#m": ["match"]}],
    (message) => messages.push(message),
    () => {},
  );

  assert.deepEqual(messages, [{type: "OPEN", from: relay}]);
  assert.equal(subscriptions.length, 0);
  assert.deepEqual(queries, [{
    filters: [{kinds: [78], "#m": ["match"]}],
    options: {relays: [relay], authors: [], timeoutMs: 15000},
  }]);

  query.resolve({
    type: "outbox.query.result",
    id: "query-1",
    events: [{event, sidecar: {relayHints: [relay, "wss://extra.example/"]}}],
  });
  await tick();

  assert.equal(subscriptions.length, 1);
  assert.deepEqual(subscriptions[0].filters, [{kinds: [78], "#m": ["match"]}]);
  assert.deepEqual(messages.map((message) => message.type), ["OPEN", "EVENT", "EOSE"]);
  assert.equal(statuses.at(-1)?.[relay]?.connected, true);
  assert.equal(statuses.at(-1)?.[relay]?.ready, true);

  subscriptions[0].handle.emit("event", {event, sidecar: {relayHints: [relay]}});
  assert.equal(messages.filter((message) => message.type === "EVENT").length, 2);
  subscriptions[0].handle.emit("closed", "relay unavailable");
  assert.equal(messages.at(-1)?.type, "CLOSED");
  assert.equal(statuses.at(-1)?.[relay]?.ready, false);

  handle.unsubscribe();
  assert.equal(subscriptions[0].handle.closed, true);
});
test("napplet receive fails closed on incomplete or unattributed results", async () => {
  const results = [
    {
      type: "outbox.query.result",
      id: "query-1",
      events: [{event, sidecar: {relayHints: ["wss://extra.example/"]}}],
    },
    {
      type: "outbox.query.result",
      id: "query-2",
      events: [{event, sidecar: {relayHints: [relay]}}],
      incomplete: true,
    },
  ];
  let subscriptions = 0;
  const outbox: NappletOutboxCapability = {
    async query() {
      return results.shift();
    },
    subscribe() {
      subscriptions += 1;
      return new MockSubscription();
    },
  };
  const transport = new NappletRelayTransport(outbox);
  const first: RelayMessage[] = [];
  const second: RelayMessage[] = [];
  transport.subscribe(relay, [{kinds: [78]}], (message) => first.push(message), () => {});
  await tick();
  transport.subscribe(relay, [{kinds: [78]}], (message) => second.push(message), () => {});
  await tick();

  assert.deepEqual(first.map((message) => message.type), ["OPEN", "ERROR"]);
  assert.deepEqual(second.map((message) => message.type), ["OPEN", "ERROR"]);
  assert.equal(first.some((message) => message.type === "EOSE"), false);
  assert.equal(second.some((message) => message.type === "EOSE"), false);
  assert.equal(subscriptions, 0);
});

test("napplet receive quarantines a live stream after invalid attribution", async () => {
  const live = new MockSubscription();
  const outbox: NappletOutboxCapability = {
    async query() {
      return {type: "outbox.query.result", id: "query-1", events: []};
    },
    subscribe() { return live; },
  };
  const transport = new NappletRelayTransport(outbox);
  const messages: RelayMessage[] = [];
  transport.subscribe(relay, [{kinds: [78]}],
    (message) => messages.push(message), () => {});
  await tick();

  live.emit("event", {event, sidecar: {relayHints: ["wss://other.example/"]}});
  assert.equal(live.closed, true);
  live.emit("event", {event, sidecar: {relayHints: [relay]}});
  assert.deepEqual(messages.map((message) => message.type),
    ["OPEN", "EOSE", "ERROR"]);
});

test("local filter enforcement restores authors removed from shell routing", () => {
  assert.equal(eventMatchesFilters(event, [{
    kinds: [78], authors: [host], "#m": ["match"], since: 4999,
  }]), true);
  assert.equal(eventMatchesFilters(event, [{authors: ["d".repeat(64)]}]), false);
  assert.equal(eventMatchesFilters(event, [{"#m": ["other"]}]), false);
  assert.equal(eventMatchesFilters(event, [{since: 5001}]), false);
});

test("napplet receive requires shell outbox", () => {
  assert.throws(
    () => new NappletRelayTransport(undefined),
    /outbox capability is unavailable/,
  );
});
