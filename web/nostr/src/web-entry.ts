import {BrowserEventAuthor} from "./browser-event-author.js";
import {installAoeNostrRuntime} from "./bridge.js";

installAoeNostrRuntime(() => new BrowserEventAuthor());
