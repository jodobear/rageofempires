import type {NostrEvent} from "applesauce-core/helpers/event";

import type {EventAuthor} from "./event-author.js";
import type {NappletIdentityCapability} from "./napplet-api.js";
import type {EventIntent} from "./protocol.js";
import {validHex64} from "./protocol.js";

export class NappletEventAuthor implements EventAuthor {
  constructor(
    private readonly identity: NappletIdentityCapability | undefined =
      globalThis.napplet?.identity,
  ) {}

  async getPublicKey(): Promise<string> {
    if (!this.identity) {
      throw new Error("napplet identity capability is unavailable");
    }
    const publicKey = await this.identity.getPublicKey();
    if (typeof publicKey !== "string" || !validHex64(publicKey)) {
      throw new Error("napplet identity returned an invalid public key");
    }
    return publicKey;
  }

  async createEvent(_intent: EventIntent): Promise<NostrEvent> {
    throw new Error("napplet publication requires the shell relay capability");
  }
}
