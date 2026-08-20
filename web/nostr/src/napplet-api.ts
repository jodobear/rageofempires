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
};

declare global {
  var napplet: {
    identity?: NappletIdentityCapability;
    outbox?: NappletOutboxCapability;
  } | undefined;
}
