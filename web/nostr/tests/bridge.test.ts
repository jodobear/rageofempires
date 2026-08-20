import assert from "node:assert/strict";
import test from "node:test";

import {
  makeShutdownDiagnostics,
  packagedRelaySelection,
} from "../src/bridge.js";

const canonicalRelays = [
  "wss://nos.lol/",
  "wss://nostr.mom/",
];

test("packaged relay selection permits the complete production pool", () => {
  assert.deepEqual(packagedRelaySelection({
    role: "host",
    relays: canonicalRelays,
    one_relay_development: false,
    compatibility_digest: "test",
  }, canonicalRelays), canonicalRelays);
});

test("packaged relay selection permits one canonical relay with opt-in", () => {
  assert.deepEqual(packagedRelaySelection({
    role: "host",
    relays: [canonicalRelays[0]],
    one_relay_development: true,
    compatibility_digest: "test",
  }, canonicalRelays), [canonicalRelays[0]]);
});

test("packaged relay selection rejects unapproved one-relay launches", () => {
  assert.throws(() => packagedRelaySelection({
    role: "host",
    relays: [canonicalRelays[0]],
    one_relay_development: false,
    compatibility_digest: "test",
  }, canonicalRelays), /match requires 2-20 relays/);
  assert.throws(() => packagedRelaySelection({
    role: "host",
    relays: ["wss://unpackaged.example/"],
    one_relay_development: true,
    compatibility_digest: "test",
  }, canonicalRelays), /runtime relay pool differs/);
});

test("shutdown diagnostics preserve app and client provenance", () => {
  assert.deepEqual(
    makeShutdownDiagnostics(
      {reason: "sdl-quit-event", monotonicMs: 12},
      {publicKey: "a".repeat(64)},
      true,
      34,
    ),
    {
      context: {reason: "sdl-quit-event", monotonicMs: 12},
      client: {publicKey: "a".repeat(64)},
      hadClient: true,
      wallTimeMs: 34,
    },
  );
});

test("shutdown diagnostics represent missing context without omission", () => {
  assert.deepEqual(makeShutdownDiagnostics(undefined, undefined, false, 5), {
    context: null,
    client: null,
    hadClient: false,
    wallTimeMs: 5,
  });
});
