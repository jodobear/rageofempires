import type {NostrEvent} from "applesauce-core/helpers/event";

import type {EventIntent} from "./protocol.js";

export interface EventAuthor {
  getPublicKey(): Promise<string>;
  createEvent(intent: EventIntent): Promise<NostrEvent>;
}

export type EventAuthorFactory = () => EventAuthor;
