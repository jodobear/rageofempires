import type {NostrEvent} from "applesauce-core/helpers/event";

import {validHex64} from "./protocol.js";

export type NappletIdentityCapability = {
  getPublicKey(): Promise<unknown>;
};

export type NappletOutboxListener = {
  close(): void;
};

export type NappletOutboxSubscription = {
  on(
    event: "event" | "closed",
    handler: (value?: unknown) => void,
  ): NappletOutboxListener;
  close(): void;
};

export type NappletOutboxCapability = {
  query(filters: unknown, options?: Record<string, unknown>): Promise<unknown>;
  subscribe(
    filters: unknown,
    options?: Record<string, unknown>,
  ): NappletOutboxSubscription;
  publish(event: unknown, options?: Record<string, unknown>): Promise<unknown>;
};

export function isNostrEvent(value: unknown): value is NostrEvent {
  if (typeof value !== "object" || value === null) return false;
  const event = value as Record<string, unknown>;
  if (typeof event.id !== "string" || typeof event.pubkey !== "string" ||
      typeof event.sig !== "string" || typeof event.content !== "string" ||
      !Number.isSafeInteger(event.kind) || !Number.isSafeInteger(event.created_at) ||
      !validHex64(event.id) || !validHex64(event.pubkey) ||
      !/^[0-9a-f]{128}$/.test(event.sig as string)) {
    return false;
  }
  return Array.isArray(event.tags) && event.tags.every((tag) =>
    Array.isArray(tag) && tag.every((part) => typeof part === "string")
  );
}

declare global {
  var napplet: {
    identity?: NappletIdentityCapability;
    outbox?: NappletOutboxCapability;
  } | undefined;
}
