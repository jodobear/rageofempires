import {EventFactory} from "applesauce-core";
import type {NostrEvent} from "applesauce-core/helpers/event";
import {PrivateKeySigner} from "applesauce-signers";

import type {EventAuthor} from "./event-author.js";
import type {EventIntent} from "./protocol.js";

export class BrowserEventAuthor implements EventAuthor {
  private readonly signer = new PrivateKeySigner();

  getPublicKey(): Promise<string> {
    return this.signer.getPublicKey();
  }

  createEvent(intent: EventIntent): Promise<NostrEvent> {
    return EventFactory.fromKind(intent.kind)
      .content(intent.content)
      .modifyPublicTags((tags) => [...tags, ...intent.tags])
      .as(this.signer)
      .sign();
  }
}
