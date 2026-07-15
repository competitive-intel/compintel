export interface TurnstileVerifyInput {
  secretKey: string;
  token: string;
  remoteIp?: string;
}

export interface TurnstileClient {
  verify(input: TurnstileVerifyInput): Promise<boolean>;
}

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function createTurnstileClient(
  fetchImpl: typeof fetch = fetch,
): TurnstileClient {
  return {
    async verify(input) {
      const body = new URLSearchParams();
      body.set("secret", input.secretKey);
      body.set("response", input.token);
      if (input.remoteIp !== undefined && input.remoteIp.length > 0) {
        body.set("remoteip", input.remoteIp);
      }

      const response = await fetchImpl(SITEVERIFY_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      });
      if (!response.ok) {
        return false;
      }
      const payload = (await response.json()) as { success?: unknown };
      return payload.success === true;
    },
  };
}
