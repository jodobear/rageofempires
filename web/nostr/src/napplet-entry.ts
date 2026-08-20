import {installAoeNostrRuntime} from "./bridge.js";
import {NappletEventAuthor} from "./napplet-event-author.js";
import {NappletRelayTransport} from "./napplet-relay-transport.js";

installAoeNostrRuntime(
  () => new NappletEventAuthor(),
  () => new NappletRelayTransport(),
);
