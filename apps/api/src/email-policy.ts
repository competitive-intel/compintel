export interface ParsedEmail {
  email: string;
  emailNormalized: string;
  provider: string;
}

export class EmailPolicyError extends Error {
  constructor(
    message: string,
    readonly code: "EMAIL_INVALID" | "EMAIL_PROVIDER_NOT_ALLOWED",
  ) {
    super(message);
    this.name = "EmailPolicyError";
  }
}

export function parseAndNormalizeEmail(
  rawEmail: string,
  allowedProviders: readonly string[],
): ParsedEmail {
  const email = rawEmail.trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) {
    throw new EmailPolicyError("邮箱格式不正确", "EMAIL_INVALID");
  }

  const local = email.slice(0, at);
  let domain = email.slice(at + 1);
  if (local.length === 0 || domain.length === 0 || domain.includes("@")) {
    throw new EmailPolicyError("邮箱格式不正确", "EMAIL_INVALID");
  }

  if (domain === "googlemail.com") {
    domain = "gmail.com";
  }

  const provider = domain.split(".")[0] ?? domain;
  const allowed = new Set(
    allowedProviders.map((value) => value.trim().toLowerCase()),
  );
  if (!allowed.has(provider) && !allowed.has(domain)) {
    throw new EmailPolicyError(
      "仅支持主流邮箱提供商，请更换邮箱后再试",
      "EMAIL_PROVIDER_NOT_ALLOWED",
    );
  }

  let normalizedLocal = local;
  let normalizedDomain = domain;
  if (domain === "gmail.com") {
    const withoutPlus = local.split("+", 1)[0] ?? local;
    normalizedLocal = withoutPlus.replaceAll(".", "");
    normalizedDomain = "gmail.com";
  }

  if (normalizedLocal.length === 0) {
    throw new EmailPolicyError("邮箱格式不正确", "EMAIL_INVALID");
  }

  return {
    email: `${local}@${domain}`,
    emailNormalized: `${normalizedLocal}@${normalizedDomain}`,
    provider: domain === "gmail.com" ? "gmail" : provider,
  };
}
