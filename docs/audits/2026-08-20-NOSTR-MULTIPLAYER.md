# Public Nostr multiplayer audit

- Verdict: **PASS**
- Evidence: `artifacts/nostr-multiplayer/20260820T115023Z-1b1268792028`
- Commit: `33d15ccdfdd62205be15890e7756913fd1b7121f`

## Identity ledger

- Host public key: `dbe1ef7917f13180d8e6e03aa87f14ed2fb06e52426c6c42caececd723956d65`
- Join public key: `21028ad0a1088c19ef18ea1b165ffec692cb1e96bf547c2f35a0017419a828de`
- Distinct: `True`
- Private material absent: `True`

## Journey ledger

| Milestone | Status |
|---|---|
| identity-lobby-start | PASS |
| ordered-input-and-empty-turns | PASS |
| chat-and-map-signal | PASS |
| committed-controls | PASS |
| relay-loss-backfill-recovery | PASS |
| synchronized-resignation | PASS |
| separate-matched-checkpoint | PASS |

## Terminal

- Method: `host Ctrl+Shift+R production command`
- Tick: `465`
- State hash: `save131+ids-fnv1a64:e8af21b882043406`

## Result

Bounded protocol acceptance passed without visual or full-match criteria.
