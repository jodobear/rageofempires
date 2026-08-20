import assert from "node:assert/strict";
import test from "node:test";

import {BrowserEventAuthor} from "../src/browser-event-author.js";
import {NappletEventAuthor} from "../src/napplet-event-author.js";
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
