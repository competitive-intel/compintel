import { Redis } from "ioredis";

/** Fixed 3-hour window for per-IP verification email send reservations. */
export const EMAIL_SEND_WINDOW_SECONDS = 3 * 60 * 60;

/**
 * After this many reserved slots in the window, subsequent requests need Turnstile.
 * Checked as `count > EMAIL_SEND_TURNSTILE_THRESHOLD` against the post-reserve count.
 */
export const EMAIL_SEND_TURNSTILE_THRESHOLD = 5;

/**
 * After this many reserved slots in the window, further sends are blocked.
 * Checked as `count > EMAIL_SEND_BLOCK_THRESHOLD` against the post-reserve count.
 */
export const EMAIL_SEND_BLOCK_THRESHOLD = 10;

export type EmailSendGate =
  { action: "allow" } | { action: "require_turnstile" } | { action: "block" };

export function gateFromCount(count: number): EmailSendGate {
  if (count > EMAIL_SEND_BLOCK_THRESHOLD) {
    return { action: "block" };
  }
  if (count > EMAIL_SEND_TURNSTILE_THRESHOLD) {
    return { action: "require_turnstile" };
  }
  return { action: "allow" };
}

export interface EmailSendLimiter {
  /**
   * Atomically reserve one send slot (INCR + TTL on first hit).
   * Gate is decided from the post-reserve count so concurrent requests cannot
   * all observe a stale low counter before any increment.
   */
  reserve(ip: string): Promise<EmailSendGate>;
  /**
   * Roll back a reservation when the email is not actually sent
   * (SES failure, gate rejection, validation error, etc.).
   * Must not drive the counter below zero or refresh/clear TTL incorrectly.
   */
  release(ip: string): Promise<void>;
}

/** INCR then set TTL only when the key is newly created. */
const RESERVE_LUA = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
end
return n
`;

/**
 * DECR with a floor of 0: delete the key at 0 instead of leaving 0 or going negative.
 * Does not touch TTL on remaining positive counts.
 */
const RELEASE_LUA = `
local v = redis.call('GET', KEYS[1])
if not v then
  return 0
end
local n = tonumber(v)
if (not n) or n <= 1 then
  redis.call('DEL', KEYS[1])
  return 0
end
return redis.call('DECR', KEYS[1])
`;

export class RedisEmailSendLimiter implements EmailSendLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly keyPrefix = "email-send:ip:",
  ) {}

  async reserve(ip: string): Promise<EmailSendGate> {
    const count = await this.redis.eval(
      RESERVE_LUA,
      1,
      this.keyFor(ip),
      String(EMAIL_SEND_WINDOW_SECONDS),
    );
    return gateFromCount(typeof count === "number" ? count : Number(count));
  }

  async release(ip: string): Promise<void> {
    await this.redis.eval(RELEASE_LUA, 1, this.keyFor(ip));
  }

  private keyFor(ip: string): string {
    return `${this.keyPrefix}${ip}`;
  }
}

/** In-memory limiter for unit tests. */
export class MemoryEmailSendLimiter implements EmailSendLimiter {
  private readonly counts = new Map<string, number>();

  async reserve(ip: string): Promise<EmailSendGate> {
    const next = (this.counts.get(ip) ?? 0) + 1;
    this.counts.set(ip, next);
    return gateFromCount(next);
  }

  async release(ip: string): Promise<void> {
    const current = this.counts.get(ip) ?? 0;
    if (current <= 1) {
      this.counts.delete(ip);
      return;
    }
    this.counts.set(ip, current - 1);
  }

  /** Test helper: seed the reserved/kept count without going through reserve. */
  setCount(ip: string, count: number): void {
    if (count <= 0) {
      this.counts.delete(ip);
      return;
    }
    this.counts.set(ip, count);
  }

  /** Test helper */
  getCount(ip: string): number {
    return this.counts.get(ip) ?? 0;
  }
}

export class NoopEmailSendLimiter implements EmailSendLimiter {
  async reserve(): Promise<EmailSendGate> {
    return { action: "allow" };
  }

  async release(): Promise<void> {}
}
