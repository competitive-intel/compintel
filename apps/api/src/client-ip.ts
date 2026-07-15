/**
 * Resolve the originating client IP for abuse controls.
 * Priority: CF-Connecting-IP → X-Real-IP → X-Forwarded-For (leftmost) → fallback.
 */
export function resolveClientIp(
  headers: Record<string, string | string[] | undefined>,
  fallbackIp: string,
): string {
  const cfConnectingIp = readHeader(headers, "cf-connecting-ip");
  if (cfConnectingIp !== null) {
    return cfConnectingIp;
  }

  const xRealIp = readHeader(headers, "x-real-ip");
  if (xRealIp !== null) {
    return xRealIp;
  }

  const forwardedFor = readHeader(headers, "x-forwarded-for");
  if (forwardedFor !== null) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first !== undefined && first.length > 0) {
      return first;
    }
  }

  return fallbackIp.trim().length > 0 ? fallbackIp : "unknown";
}

function readHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | null {
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== lower) continue;
    const raw = Array.isArray(value) ? value[0] : value;
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return null;
}
