import {verifyEvent} from "applesauce-core/helpers/event";
import type {NostrEvent} from "applesauce-core/helpers/event";

import type {AuthoredPublication, EventAuthor} from "./event-author.js";
import {
  isNostrEvent,
  type NappletIdentityCapability,
  type NappletOutboxCapability,
} from "./napplet-api.js";
import type {EventIntent} from "./protocol.js";
import {validHex64} from "./protocol.js";
import type {PublishResponse} from "./relay-transport.js";

function sameTags(left: string[][], right: string[][]): boolean {
  return left.length === right.length && left.every((tag, index) =>
    tag.length === right[index].length &&
    tag.every((part, partIndex) => part === right[index][partIndex])
  );
}

function sameEventIdentity(left: NostrEvent, right: NostrEvent): boolean {
  return left.id === right.id && left.pubkey === right.pubkey &&
    left.created_at === right.created_at && left.kind === right.kind &&
    left.content === right.content && sameTags(left.tags, right.tags);
}

function shellResults(
  value: Record<string, unknown>,
  relays: string[],
): PublishResponse[] {
  const relayMap = typeof value.relays === "object" && value.relays !== null
    ? value.relays as Record<string, unknown> : {};
  const message = typeof value.error === "string" ? value.error : "";
  return relays.map((relay) => ({
    from: relay,
    ok: relayMap[relay] === true,
    ...(relayMap[relay] === true || message.length === 0 ? {} : {message}),
  }));
}

export class NappletEventAuthor implements EventAuthor {
  private publicKey: string | undefined;

  constructor(
    private readonly identity: NappletIdentityCapability | undefined =
      globalThis.napplet?.identity,
    private readonly outbox: NappletOutboxCapability | undefined =
      globalThis.napplet?.outbox,
    private readonly nowSeconds: () => number =
      () => Math.floor(Date.now() / 1000),
  ) {}

  async getPublicKey(): Promise<string> {
    if (!this.identity) {
      throw new Error("napplet identity capability is unavailable");
    }
    const publicKey = await this.identity.getPublicKey();
    if (typeof publicKey !== "string" || !validHex64(publicKey)) {
      throw new Error("napplet identity returned an invalid public key");
    }
    this.publicKey = publicKey;
    return publicKey;
  }

  async createEvent(_intent: EventIntent): Promise<NostrEvent> {
    throw new Error("napplet publication requires the shell relay capability");
  }

  async publishThroughShell(
    intent: EventIntent,
    relays: string[],
  ): Promise<AuthoredPublication> {
    return this.publishTemplate({
      kind: intent.kind,
      content: intent.content,
      tags: intent.tags.map((tag) => [...tag]),
      created_at: this.nowSeconds(),
    }, relays, intent);
  }

  async republishThroughShell(
    event: NostrEvent,
    relays: string[],
  ): Promise<AuthoredPublication> {
    const publication = await this.publishTemplate(event, relays);
    if (!sameEventIdentity(publication.event, event)) {
      throw new Error("napplet shell changed the cached event identity");
    }
    return publication;
  }

  private async publishTemplate(
    template: unknown,
    relays: string[],
    intent?: EventIntent,
  ): Promise<AuthoredPublication> {
    if (!this.outbox) throw new Error("napplet outbox capability is unavailable");
    if (!this.publicKey) throw new Error("napplet identity is not initialized");
    if (relays.length === 0) throw new Error("napplet publish has no active relays");
    const value = await this.outbox.publish(template, {
      relays: [...relays],
      toOutbox: false,
    });
    if (typeof value !== "object" || value === null) {
      throw new Error("napplet outbox returned an invalid publish result");
    }
    const result = value as Record<string, unknown>;
    if (result.type !== "outbox.publish.result" ||
        !isNostrEvent(result.event) || !verifyEvent(result.event) ||
        result.eventId !== result.event.id ||
        result.event.pubkey !== this.publicKey) {
      throw new Error("napplet outbox returned an invalid signed event");
    }
    if (intent && (result.event.kind !== intent.kind ||
        result.event.content !== intent.content ||
        !sameTags(result.event.tags, intent.tags) ||
        result.event.created_at !==
          (template as {created_at: number}).created_at)) {
      throw new Error("napplet outbox changed the event template");
    }
    return {event: result.event, results: shellResults(result, relays)};
  }
}
