import type {NostrEvent} from "applesauce-core/helpers/event";

import type {EventIntent} from "./protocol.js";
import type {PublishResponse} from "./relay-transport.js";

export type AuthoredPublication = {
  event: NostrEvent;
  results: PublishResponse[];
};

export interface EventAuthor {
  getPublicKey(): Promise<string>;
  createEvent(intent: EventIntent): Promise<NostrEvent>;
  publishThroughShell?(
    intent: EventIntent,
    relays: string[],
  ): Promise<AuthoredPublication>;
  republishThroughShell?(
    event: NostrEvent,
    relays: string[],
  ): Promise<AuthoredPublication>;
}

export type EventAuthorFactory = () => EventAuthor;
