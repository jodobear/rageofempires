import assert from "node:assert/strict";
import test from "node:test";

import {EventFactory} from "applesauce-core";
import type {NostrEvent} from "applesauce-core/helpers/event";
import {PrivateKeySigner} from "applesauce-signers";

import {BrowserEventAuthor} from "../src/browser-event-author.js";
import {NappletEventAuthor} from "../src/napplet-event-author.js";
import type {NappletOutboxCapability} from "../src/napplet-api.js";
import {MATCH_KIND} from "../src/protocol.js";

const publicKey = "a".repeat(64);
const intent = {
  intent_id: "test-intent",
  kind: MATCH_KIND,
  tags: [["t", "aoe-reconstruction"]],
  content: "{}",
};

test("napplet author accepts the exact shell public key", async () => {
  const author = new NappletEventAuthor({
    getPublicKey: async () => publicKey,
  });
  assert.equal(await author.getPublicKey(), publicKey);
});

test("napplet author reads the injected global identity capability", async () => {
  const previous = globalThis.napplet;
  globalThis.napplet = {identity: {getPublicKey: async () => publicKey}};
  try {
    assert.equal(await new NappletEventAuthor().getPublicKey(), publicKey);
  } finally {
    globalThis.napplet = previous;
  }
});

test("napplet author rejects unavailable or invalid shell identity", async () => {
  const invalidValues: unknown[] = ["", "A".repeat(64), "g".repeat(64), 7];
  await assert.rejects(
    new NappletEventAuthor(undefined).getPublicKey(),
    /identity capability is unavailable/,
  );
  for (const value of invalidValues) {
    await assert.rejects(
      new NappletEventAuthor({getPublicKey: async () => value}).getPublicKey(),
      /invalid public key/,
    );
  }
  await assert.rejects(
    new NappletEventAuthor({
      getPublicKey: async () => { throw new Error("shell rejected identity"); },
    }).getPublicKey(),
    /shell rejected identity/,
  );
});

test("napplet author defers publication to the shell relay capability", async () => {
  const author = new NappletEventAuthor({
    getPublicKey: async () => publicKey,
  });
  await assert.rejects(author.createEvent(intent), /shell relay capability/);
});

test("napplet author publishes an exact template and preserves relay failures", async () => {
  const signer = new PrivateKeySigner();
  const signerPublicKey = await signer.getPublicKey();
  const relays = ["wss://one.example/", "wss://two.example/"];
  const calls: Array<{event: unknown; options?: Record<string, unknown>}> = [];
  let signedEvent: NostrEvent | undefined;
  const outbox: NappletOutboxCapability = {
    async query() { throw new Error("unexpected query"); },
    subscribe() { throw new Error("unexpected subscribe"); },
    async publish(event, options) {
      calls.push({event, options});
      const template = event as {
        kind: number; content: string; tags: string[][]; created_at: number;
      };
      signedEvent = await EventFactory.fromKind(template.kind)
        .content(template.content)
        .created(template.created_at)
        .modifyPublicTags(() => template.tags)
        .as(signer)
        .sign();
      return {
        type: "outbox.publish.result",
        ok: true,
        event: signedEvent,
        eventId: signedEvent.id,
        relays: {
          [relays[0]]: true,
          [relays[1]]: false,
          "wss://extra.example/": true,
        },
        error: "one relay rejected",
      };
    },
  };
  const author = new NappletEventAuthor(
    {getPublicKey: async () => signerPublicKey}, outbox, () => 1234,
  );
  await author.getPublicKey();
  const publication = await author.publishThroughShell(intent, relays);

  assert.deepEqual(calls[0], {
    event: {kind: MATCH_KIND, content: "{}",
      tags: [["t", "aoe-reconstruction"]], created_at: 1234},
    options: {relays, toOutbox: false},
  });
  assert.equal(publication.event.id, signedEvent?.id);
  assert.deepEqual(publication.results, [
    {from: relays[0], ok: true},
    {from: relays[1], ok: false, message: "one relay rejected"},
  ]);

  const repair = await author.republishThroughShell(publication.event, relays);
  assert.deepEqual(calls[1].event, publication.event);
  assert.equal(repair.event.id, publication.event.id);
});

test("napplet author fails closed on missing or changed signed events", async () => {
  const signer = new PrivateKeySigner();
  const signerPublicKey = await signer.getPublicKey();
  const outbox: NappletOutboxCapability = {
    async query() { throw new Error("unexpected query"); },
    subscribe() { throw new Error("unexpected subscribe"); },
    async publish() {
      return {type: "outbox.publish.result", ok: false, relays: {}};
    },
  };
  const author = new NappletEventAuthor(
    {getPublicKey: async () => signerPublicKey}, outbox, () => 1234,
  );
  await author.getPublicKey();
  await assert.rejects(
    author.publishThroughShell(intent, ["wss://one.example/"]),
    /invalid signed event/,
  );
  await assert.rejects(
    author.publishThroughShell(intent, []),
    /no active relays/,
  );
});

test("browser author keeps standalone ephemeral event signing", async () => {
  const first = new BrowserEventAuthor();
  const second = new BrowserEventAuthor();
  const firstPublicKey = await first.getPublicKey();
  const secondPublicKey = await second.getPublicKey();
  assert.match(firstPublicKey, /^[0-9a-f]{64}$/);
  assert.match(secondPublicKey, /^[0-9a-f]{64}$/);
  assert.notEqual(firstPublicKey, secondPublicKey);
  const event = await first.createEvent(intent);
  assert.equal(event.pubkey, firstPublicKey);
  assert.equal(event.kind, MATCH_KIND);
  assert.equal(event.content, "{}");
  assert.match(event.id, /^[0-9a-f]{64}$/);
  assert.match(event.sig, /^[0-9a-f]{128}$/);
});
