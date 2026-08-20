import {BrowserEventAuthor} from "./browser-event-author.js";
import {BrowserRelayTransport} from "./browser-relay-transport.js";
import {installAoeNostrRuntime} from "./bridge.js";

installAoeNostrRuntime(
  () => new BrowserEventAuthor(),
  () => new BrowserRelayTransport(),
);
