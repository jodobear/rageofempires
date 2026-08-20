import {installAoeNostrRuntime} from "./bridge.js";
import {NappletEventAuthor} from "./napplet-event-author.js";

installAoeNostrRuntime(() => new NappletEventAuthor());
