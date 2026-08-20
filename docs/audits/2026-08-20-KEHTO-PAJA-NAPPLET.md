# Kehto/Paja napplet acceptance — 2026-08-20

Status: PASS

## Frozen inputs and destinations

- Rage source head: `3d8f16cd32f754534e40663aac47588fb65366a6`
- Kehto source head: `1b5c06c8e451850c07c6cede403ae846e804ee70`
- Report: `docs/audits/2026-08-20-KEHTO-PAJA-NAPPLET.md`
- Durable local artifacts: `artifacts/kehto-paja-napplet-3d8f16c/`

The acceptance run began only after these paths existed.

## Artifact

The package verifier accepted the self-contained HTML and kind-35129 manifest
before runtime launch.

- `index.html`: 83,164,449 bytes,
  SHA-256 `7f23d54a5837d44f60689632c9112cdd14ce68cf8a38b8dc3fcff0b98560be72`
- `.nip5a-manifest.json`: SHA-256
  `2d9d0d7d28cb412ca715cd69742f192043061fbd3a0292d36a712d4432baf35a`

Kehto's official local Paja CLI loaded that exact verified file from a local
HTTP server. Paja reported `Target ready`, logged one `shell.ready` followed by
one `shell.init`, and ran the game document at `about:srcdoc`.

## Runtime acceptance

Single player reached live gameplay rather than a mock or menu-only path:

- WebGL/SDL canvas became visible at a 1280x720 backing size.
- Simulation advanced from tick 84 to tick 374.
- One real page pointer-down and one real `ArrowRight` key event reached the
  opaque iframe; the canvas retained focus.
- Resizing the browser from 1280x720 to 1024x768 produced both `resize` and
  `canvas-resize` records. Canvas backing size settled at 664x374 with a
  664x373.5 CSS presentation.
- Audio started once. Music made two play attempts, remained live, and one
  gameplay effect played. Audio telemetry contained no errors.
- Browser telemetry contained no uncaught errors and no reported failures.

The screenshot is
`artifacts/kehto-paja-napplet-3d8f16c/paja-gameplay.png` with SHA-256
`007a8c527f399a3d2aff27720c694049ee54c6819b6c408f44c78f026a75c4c6`.
Structured evidence is
`artifacts/kehto-paja-napplet-3d8f16c/runtime-acceptance.json`.

## Findings

No Rage-owned or Kehto-owned blocker was reproduced for single-player startup,
WebAssembly, WebGL, pointer, keyboard, resize, or audio activation. No Kehto
issue was filed.

The browser console contains existing game diagnostics written through
`console.error` and WebGL `ReadPixels` performance warnings. Neither appeared
in the runtime's uncaught-error, reported-failure, or audio-error channels.

Uzel remains unable to accept this approximately 83 MiB HTML artifact because
its current loader caps HTML at 512 KiB. That separate runtime limitation is
tracked in `jodobear/uzel#47`; it did not affect this Kehto/Paja verdict.
