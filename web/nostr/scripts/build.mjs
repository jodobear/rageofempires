import {build} from "esbuild";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";

const webOutfile = process.env.AOE_NOSTR_BUNDLE ||
  resolve(process.cwd(), "../../build-web/nostr/aoe_nostr.js");
const nappletOutfile = process.env.AOE_NAPPLET_NOSTR_BUNDLE ||
  resolve(process.cwd(), "../../build-web/nostr/aoe_napplet_nostr.js");

await build({
  entryPoints: [resolve(process.cwd(), "src/web-entry.ts")],
  bundle: true,
  format: "iife",
  globalName: "AoeNostrBundle",
  outfile: webOutfile,
});

const nappletBuild = await build({
  entryPoints: [resolve(process.cwd(), "src/napplet-entry.ts")],
  bundle: true,
  format: "iife",
  globalName: "AoeNostrBundle",
  metafile: true,
  outfile: nappletOutfile,
});

const forbiddenInput = Object.keys(nappletBuild.metafile.inputs).find((input) =>
  input.includes("applesauce-signers") || input.includes("applesauce-relay")
);
if (forbiddenInput) {
  throw new Error(`napplet bundle includes forbidden authority or relay input: ${forbiddenInput}`);
}
const nappletSource = await readFile(nappletOutfile, "utf8");
for (const marker of [
  "PrivateKeySigner",
  "identity.signEvent",
  "napplet.identity.signEvent",
  "window.nostr",
  "globalThis.nostr",
  "WebSocket",
]) {
  if (nappletSource.includes(marker)) {
    throw new Error(`napplet bundle includes forbidden marker: ${marker}`);
  }
}
