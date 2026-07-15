import { Redis } from "ioredis";

/** Sliding 3-hour window for per-IP verification email sends. */
export const EMAIL_SEND_WINDOW_SECONDS = 3 * 60 * 60;

/**
 * After this many successful sends in the window, subsequent requests need Turnstile.
 * Checked as `count > EMAIL_SEND_TURNSTILE_THRESHOLD` against already-sent count.
 */
export const EMAIL_SEND_TURNSTILE_THRESHOLD = 5;

/**
 * After this many successful sends in the window, further sends are blocked.
 * Checked as `count > EMAIL_SEND_BLOCK_THRESHOLD`.
 */
export const EMAIL_SEND_BLOCK_THRESHOLD = 10;

export type EmailSendGate =
  { action: "allow" } | { action: "require_turnstile" } | { action: "block" };

export interface EmailSendLimiter {
  check(ip: string): Promise<EmailSendGate>;
  /** Increment only after a verification email was actually sent. */
  recordSuccessfulSend(ip: string): Promise<void>;
}

export class RedisEmailSendLimiter implements EmailSendLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly keyPrefix = "email-send:ip:",
  ) {}

  async check(ip: string): Promise<EmailSendGate> {
    const count = await this.readCount(ip);
    if (count > EMAIL_SEND_BLOCK_THRESHOLD) {
      return { action: "block" };
    }
    if (count > EMAIL_SEND_TURNSTILE_THRESHOLD) {
      return { action: "require_turnstile" };
    }
    return { action: "allow" };
  }

  async recordSuccessfulSend(ip: string): Promise<void> {
    const key = this.keyFor(ip);
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, EMAIL_SEND_WINDOW_SECONDS);
    }
  }

  private async readCount(ip: string): Promise<number> {
    const raw = await this.redis.get(this.keyFor(ip));
    if (raw === null) return 0;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  private keyFor(ip: string): string {
    return `${this.keyPrefix}${ip}`;
  }
}

/** In-memory limiter for unit tests. */
export class MemoryEmailSendLimiter implements EmailSendLimiter {
  private readonly counts = new Map<string, number>();

  async check(ip: string): Promise<EmailSendGate> {
    const count = this.counts.get(ip) ?? 0;
    if (count > EMAIL_SEND_BLOCK_THRESHOLD) {
      return { action: "block" };
    }
    if (count > EMAIL_SEND_TURNSTILE_THRESHOLD) {
      return { action: "require_turnstile" };
    }
    return { action: "allow" };
  }

  async recordSuccessfulSend(ip: string): Promise<void> {
    this.counts.set(ip, (this.counts.get(ip) ?? 0) + 1);
  }

  /** Test helper */
  setCount(ip: string, count: number): void {
    this.counts.set(ip, count);
  }
}

export class NoopEmailSendLimiter implements EmailSendLimiter {
  async check(): Promise<EmailSendGate> {
    return { action: "allow" };
  }

  async recordSuccessfulSend(): Promise<void> {}
}
