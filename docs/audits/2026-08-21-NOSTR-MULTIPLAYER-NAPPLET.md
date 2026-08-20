# Nostr multiplayer napplet acceptance — 2026-08-21

## Scope

Two independent Kehto Paja browser clients loaded the production napplet
artifact, used separate development signers, and attempted a two-player public
match through only `wss://nos.lol/`. The run covered identity, lobby discovery,
join, acknowledgement, ready, host start, initial lockstep turns, deterministic
state agreement, and browser audio telemetry.

Evidence is under
`docs/audits/evidence/2026-08-21-napplet-single-relay/`. The tested artifact was
`build-napplet/napplet-dist/index.html`, 82,953,182 bytes, SHA-256
`9298c3cc23462e37b01d362489849b33101662bc113a49b55a3d3d41aee75f1b`.

## Result

Verdict: **partial**. Single-relay lobby and Start acceptance passed. Sustained
gameplay did not pass.

- Paja must have a signer connected before launching Rage. Without one,
  `identity.getPublicKey()` yields no usable key and Rage reports `napplet
  identity returned an invalid public key`. That is the failure shown in the
  supplied screenshot; the zero usable relays and placeholder peer follow from
  initialization never completing.
- The one-relay checkbox now selects the first packaged canonical relay,
  `wss://nos.lol/`. The bridge accepts that one packaged relay only when the
  explicit development flag is present. Arbitrary relay injection remains
  rejected. Its displayed pause rule says the single configured relay must
  remain available. Normal packaged-pool behavior and its quorum-two message
  are unchanged.
- Host and join discovered the same match and roster. Each observed both
  acknowledgement and ready events with one usable relay and one completed
  backfill.
- Host `Ctrl+Enter` successfully requested Start. Event
  `5cdc83656121dca85c89f01421d49766107979c916beae9346deda4f60f7bcf2`
  was accepted by `nos.lol`.
- Both clients entered gameplay, reached tick 7, and reported identical state
  hash `save131+ids-fnv1a64:eeae939d0a971e81`.
- Both then suspended with `sender previous-event chain mismatch`.

## Precise remaining blocker

Paja prompts separately for every Sign and Publish operation. A queued turn
request exceeded the shell request lifetime before approval. Rage therefore
treated that publication as failed and retained the previous acknowledged turn
ID. Paja nevertheless allowed and published the expired request later.

Relay evidence proves the resulting invalid chain. Host sender sequence 2,
event `15c31a5f2e9535973ab71471759edcec55f62954219970e8b53981bbe3cec230`,
names sequence 1 event `6b8ee8c220a9282cecf71b996aa85179409421f1bbef6760bf0a1b0fad9269f0`
as its predecessor. Host sender sequence 3, event
`d8296cb3002bf9b7812378fdf622e0260f64b974a127b27b62865f799b405cb5`,
also names sequence 1 instead of sequence 2. The protocol correctly rejects
that chain in `NostrSenderSequence::drain()`.

This is tracked by Rage issue #16 and Uzel issue #49. A proper fix needs a
bounded match-scoped signing/publication grant and cancellation of expired or
orphaned requests so a stale approval cannot publish later.

## Audio

Both clients reported one audio-system start, two music play attempts, one live
music instance, and no browser audio errors. This proves successful runtime
initialization and playback calls, not audible speaker output. Human listening
remains required; no audio code changed in this slice.

## Verification

- `npm test`: 32 tests passed.
- `npm run typecheck`: passed.
- `make CMAKE_ARGS="-DAOE_BUILD_SDL3=ON -DSDL_UNIX_CONSOLE_BUILD=ON"`: passed.
- `make napplet-build`: passed; seven package checks passed.
- macOS bundle logic was not changed.

## Evidence inventory

- `user-host-failure.png`: supplied failure before signer initialization.
- `host-lobby.png`, `join-lobby.png`: both clients in the same one-relay lobby.
- `host-post-start.png`, `join-post-start.png`: both clients in gameplay.
- `result-summary.json`: compact identities, relay, tick, state-hash, audio, and
  failed-chain evidence.

The rebuilt artifact has not been uploaded or republished. Therefore this is
local production-artifact acceptance, not deployed acceptance, and issue #28
must not be classified as a production fix yet.
