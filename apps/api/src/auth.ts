import {
  createHash,
  randomBytes,
  randomInt,
  scrypt as nodeScrypt,
  timingSafeEqual,
} from "node:crypto";

import type {
  AdminUser,
  CurrentUser,
  LoginInput,
  RegisterInput,
  ResendVerificationInput,
  ReviewUserInput,
  VerifyEmailInput,
  VerifyEmailResponse,
} from "@compintel/contracts";
import { Prisma, type PrismaClient } from "@compintel/db";

import {
  NoopEmailSendLimiter,
  type EmailSendLimiter,
} from "./email-send-limiter.js";
import { EmailPolicyError, parseAndNormalizeEmail } from "./email-policy.js";
import { HttpError } from "./errors.js";
import { createTencentSesClient, type SesClient } from "./ses-client.js";
import { SystemSettingsService } from "./system-settings.js";
import { createTurnstileClient, type TurnstileClient } from "./turnstile.js";

const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1_000;
const VERIFICATION_CODE_TTL_MS = 15 * 60 * 1_000;
const RESEND_COOLDOWN_MS = 60 * 1_000;
const MAX_VERIFY_ATTEMPTS = 10;
/** Unverified accounts older than this may be deleted to free username/email. */
const UNVERIFIED_ACCOUNT_TTL_MS = 24 * 60 * 60 * 1_000;
const SCRYPT_PARAMETERS = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1_024 * 1_024 };

export interface CreatedSession {
  token: string;
  expiresAt: Date;
  user: CurrentUser;
}

export interface AuthMailContext {
  clientIp: string;
}

export interface AuthServiceOptions {
  ses?: SesClient;
  settings?: SystemSettingsService;
  emailSendLimiter?: EmailSendLimiter;
  turnstile?: TurnstileClient;
  now?: () => Date;
}

export class AuthService {
  private readonly ses: SesClient;
  private readonly settings: SystemSettingsService;
  private readonly emailSendLimiter: EmailSendLimiter;
  private readonly turnstile: TurnstileClient;
  private readonly now: () => Date;

  constructor(
    private readonly db: PrismaClient,
    options: AuthServiceOptions = {},
  ) {
    this.ses = options.ses ?? createTencentSesClient();
    this.settings = options.settings ?? new SystemSettingsService(db);
    this.emailSendLimiter =
      options.emailSendLimiter ?? new NoopEmailSendLimiter();
    this.turnstile = options.turnstile ?? createTurnstileClient();
    this.now = options.now ?? (() => new Date());
  }

  async register(
    input: RegisterInput,
    context: AuthMailContext,
  ): Promise<CurrentUser> {
    const mailConfig = await this.settings.getRawForMail();
    assertSesConfigured(mailConfig, "邮件服务尚未配置，暂时无法注册");
    await this.enforceEmailSendGate(
      context.clientIp,
      input.turnstileToken,
      mailConfig,
    );

    let parsed;
    try {
      parsed = parseAndNormalizeEmail(
        input.email,
        mailConfig.allowedEmailProviders,
      );
    } catch (error) {
      if (error instanceof EmailPolicyError) {
        throw new HttpError(400, error.message, error.code);
      }
      throw error;
    }

    await this.reclaimStaleUnverifiedConflicts(
      input.username,
      parsed.emailNormalized,
    );

    const passwordHash = await hashPassword(input.password);
    const verifyCode = generateVerificationCode();
    const codeHash = hashVerificationCode(verifyCode);
    const sentAt = this.now();
    const expiresAt = new Date(sentAt.getTime() + VERIFICATION_CODE_TTL_MS);

    let user;
    try {
      user = await this.db.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            username: input.username,
            displayName: input.displayName,
            email: parsed.email,
            emailNormalized: parsed.emailNormalized,
            passwordHash,
          },
        });
        await tx.emailVerification.create({
          data: {
            userId: created.id,
            codeHash,
            expiresAt,
            sentAt,
          },
        });
        return created;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const target = Array.isArray(error.meta?.target)
          ? error.meta.target.join(",")
          : String(error.meta?.target ?? "");
        if (target.includes("emailNormalized") || target.includes("email")) {
          throw new HttpError(409, "该邮箱已被使用", "EMAIL_CONFLICT");
        }
        throw new HttpError(409, "用户名已被使用", "USERNAME_CONFLICT");
      }
      throw error;
    }

    try {
      await this.ses.sendVerificationEmail({
        secretId: mailConfig.secretId,
        secretKey: mailConfig.secretKey,
        fromAddress: mailConfig.fromAddress,
        templateId: mailConfig.templateId,
        toAddress: parsed.email,
        username: user.username,
        verifyCode,
      });
    } catch {
      await this.db.user.delete({ where: { id: user.id } }).catch(() => {});
      throw new HttpError(
        502,
        "验证邮件发送失败，请稍后重试",
        "EMAIL_SEND_FAILED",
      );
    }

    await this.emailSendLimiter.recordSuccessfulSend(context.clientIp);
    return serializeUser(user);
  }

  async verifyEmail(input: VerifyEmailInput): Promise<VerifyEmailResponse> {
    const user = await this.db.user.findUnique({
      where: { username: input.username },
      include: { emailVerification: true },
    });
    if (user === null) {
      throw new HttpError(404, "用户不存在", "USER_NOT_FOUND");
    }
    if (user.emailVerifiedAt !== null) {
      // Do not return CurrentUser to unauthenticated callers.
      return { ok: true };
    }
    const challenge = user.emailVerification;
    if (challenge === null) {
      throw new HttpError(400, "请先重新发送验证码", "VERIFICATION_NOT_FOUND");
    }
    if (challenge.expiresAt.getTime() <= this.now().getTime()) {
      throw new HttpError(
        400,
        "验证码已过期，请重新获取",
        "VERIFICATION_EXPIRED",
      );
    }
    if (challenge.attemptCount >= MAX_VERIFY_ATTEMPTS) {
      throw new HttpError(
        429,
        "验证尝试次数过多，请重新获取验证码",
        "VERIFICATION_ATTEMPTS_EXCEEDED",
      );
    }

    const expected = Buffer.from(challenge.codeHash, "hex");
    const actual = Buffer.from(hashVerificationCode(input.code), "hex");
    const matched =
      expected.length === actual.length && timingSafeEqual(expected, actual);
    if (!matched) {
      await this.db.emailVerification.update({
        where: { userId: user.id },
        data: { attemptCount: { increment: 1 } },
      });
      throw new HttpError(400, "验证码不正确", "VERIFICATION_INVALID");
    }

    const updated = await this.db.$transaction(async (tx) => {
      const next = await tx.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: this.now() },
      });
      await tx.emailVerification.delete({ where: { userId: user.id } });
      return next;
    });
    return { user: serializeUser(updated) };
  }

  async resendVerification(
    input: ResendVerificationInput,
    context: AuthMailContext,
  ): Promise<{ ok: true }> {
    const mailConfig = await this.settings.getRawForMail();
    assertSesConfigured(mailConfig, "邮件服务尚未配置，暂时无法发送验证码");
    await this.enforceEmailSendGate(
      context.clientIp,
      input.turnstileToken,
      mailConfig,
    );

    const user = await this.db.user.findUnique({
      where: { username: input.username },
      include: { emailVerification: true },
    });
    if (user === null) {
      throw new HttpError(404, "用户不存在", "USER_NOT_FOUND");
    }
    if (user.emailVerifiedAt !== null) {
      throw new HttpError(400, "邮箱已验证", "EMAIL_ALREADY_VERIFIED");
    }

    const existing = user.emailVerification;
    if (
      existing !== null &&
      this.now().getTime() - existing.sentAt.getTime() < RESEND_COOLDOWN_MS
    ) {
      throw new HttpError(
        429,
        "验证码发送过于频繁，请稍后再试",
        "VERIFICATION_RESEND_COOLDOWN",
      );
    }

    const verifyCode = generateVerificationCode();
    const codeHash = hashVerificationCode(verifyCode);
    const sentAt = this.now();
    const expiresAt = new Date(sentAt.getTime() + VERIFICATION_CODE_TTL_MS);

    try {
      await this.ses.sendVerificationEmail({
        secretId: mailConfig.secretId,
        secretKey: mailConfig.secretKey,
        fromAddress: mailConfig.fromAddress,
        templateId: mailConfig.templateId,
        toAddress: user.email,
        username: user.username,
        verifyCode,
      });
    } catch {
      throw new HttpError(
        502,
        "验证邮件发送失败，请稍后重试",
        "EMAIL_SEND_FAILED",
      );
    }

    // Persist the new challenge only after SES succeeds so a failed send
    // keeps the previous code and does not start a cooldown window.
    await this.db.emailVerification.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        codeHash,
        expiresAt,
        sentAt,
        attemptCount: 0,
      },
      update: {
        codeHash,
        expiresAt,
        sentAt,
        attemptCount: 0,
      },
    });

    await this.emailSendLimiter.recordSuccessfulSend(context.clientIp);
    return { ok: true };
  }

  async login(input: LoginInput): Promise<CreatedSession> {
    const user = await this.db.user.findUnique({
      where: { username: input.username },
    });
    if (
      user === null ||
      !(await verifyPassword(input.password, user.passwordHash))
    ) {
      throw new HttpError(401, "用户名或密码错误", "INVALID_CREDENTIALS");
    }
    if (user.emailVerifiedAt === null) {
      throw new HttpError(403, "请先完成邮箱验证", "EMAIL_UNVERIFIED");
    }
    if (user.approvalStatus === "PENDING") {
      throw new HttpError(403, "账号正在等待管理员审核", "ACCOUNT_PENDING");
    }
    if (user.approvalStatus === "REJECTED") {
      throw new HttpError(403, "账号注册申请未通过审核", "ACCOUNT_REJECTED");
    }

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(this.now().getTime() + SESSION_LIFETIME_MS);
    await this.db.session.create({
      data: { tokenHash: hashSessionToken(token), userId: user.id, expiresAt },
    });
    return { token, expiresAt, user: serializeUser(user) };
  }

  async authenticate(token: string | null): Promise<CurrentUser | null> {
    if (token === null) return null;
    const session = await this.db.session.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      include: { user: true },
    });
    if (session === null) return null;
    if (
      session.expiresAt.getTime() <= this.now().getTime() ||
      session.user.approvalStatus !== "APPROVED" ||
      session.user.emailVerifiedAt === null
    ) {
      await this.db.session.deleteMany({ where: { id: session.id } });
      return null;
    }
    return serializeUser(session.user);
  }

  async logout(token: string | null): Promise<void> {
    if (token === null) return;
    await this.db.session.deleteMany({
      where: { tokenHash: hashSessionToken(token) },
    });
  }

  async listUsers(): Promise<AdminUser[]> {
    const users = await this.db.user.findMany({
      orderBy: [{ approvalStatus: "asc" }, { createdAt: "desc" }],
      include: {
        reviewedBy: { select: { id: true, displayName: true } },
      },
    });
    return users.map(serializeAdminUser);
  }

  async reviewUser(
    administratorId: string,
    userId: string,
    input: ReviewUserInput,
  ): Promise<AdminUser> {
    if (administratorId === userId) {
      throw new HttpError(400, "不能审核自己的账号", "CANNOT_REVIEW_SELF");
    }
    const status = input.decision === "APPROVE" ? "APPROVED" : "REJECTED";
    const existing = await this.db.user.findUnique({ where: { id: userId } });
    if (existing === null) {
      throw new HttpError(404, "用户不存在", "USER_NOT_FOUND");
    }
    if (existing.role === "ADMIN") {
      throw new HttpError(400, "不能审核管理员账号", "CANNOT_REVIEW_ADMIN");
    }
    if (existing.emailVerifiedAt === null) {
      throw new HttpError(
        400,
        "该用户尚未完成邮箱验证，暂不能审核",
        "EMAIL_UNVERIFIED",
      );
    }

    const user = await this.db.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          approvalStatus: status,
          reviewedAt: this.now(),
          reviewedById: administratorId,
        },
        include: {
          reviewedBy: { select: { id: true, displayName: true } },
        },
      });
      if (status === "REJECTED") {
        await tx.session.deleteMany({ where: { userId } });
      }
      return updated;
    });
    return serializeAdminUser(user);
  }

  private async enforceEmailSendGate(
    clientIp: string,
    turnstileToken: string | undefined,
    mailConfig: { turnstileSiteKey: string; turnstileSecretKey: string },
  ): Promise<void> {
    const gate = await this.emailSendLimiter.check(clientIp);
    if (gate.action === "block") {
      throw new HttpError(
        429,
        "该网络发信次数过多，请稍后再试",
        "EMAIL_SEND_IP_BLOCKED",
      );
    }
    if (gate.action === "require_turnstile") {
      if (
        mailConfig.turnstileSiteKey.length === 0 ||
        mailConfig.turnstileSecretKey.length === 0
      ) {
        throw new HttpError(
          503,
          "人机验证尚未配置，暂时无法继续发送验证邮件",
          "TURNSTILE_NOT_CONFIGURED",
        );
      }
      if (turnstileToken === undefined || turnstileToken.length === 0) {
        throw new HttpError(
          429,
          "请完成人机验证后再发送验证邮件",
          "TURNSTILE_REQUIRED",
        );
      }
      const ok = await this.turnstile.verify({
        secretKey: mailConfig.turnstileSecretKey,
        token: turnstileToken,
        remoteIp: clientIp,
      });
      if (!ok) {
        throw new HttpError(400, "人机验证失败，请重试", "TURNSTILE_FAILED");
      }
    }
  }

  /**
   * If an unverified account has held the username or email for longer than
   * UNVERIFIED_ACCOUNT_TTL_MS, delete it (cascades sessions + verification).
   */
  private async reclaimStaleUnverifiedConflicts(
    username: string,
    emailNormalized: string,
  ): Promise<void> {
    const cutoff = new Date(this.now().getTime() - UNVERIFIED_ACCOUNT_TTL_MS);
    const stale = await this.db.user.findMany({
      where: {
        emailVerifiedAt: null,
        createdAt: { lt: cutoff },
        OR: [{ username }, { emailNormalized }],
      },
      select: { id: true },
    });
    if (stale.length === 0) return;
    await this.db.user.deleteMany({
      where: { id: { in: stale.map((row) => row.id) } },
    });
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = await scrypt(password, salt);
  return [
    "scrypt",
    SCRYPT_PARAMETERS.N,
    SCRYPT_PARAMETERS.r,
    SCRYPT_PARAMETERS.p,
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}

async function verifyPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, encodedSalt, encodedKey] = parts;
  if (
    Number(n) !== SCRYPT_PARAMETERS.N ||
    Number(r) !== SCRYPT_PARAMETERS.r ||
    Number(p) !== SCRYPT_PARAMETERS.p ||
    encodedSalt === undefined ||
    encodedKey === undefined
  ) {
    return false;
  }
  const expected = Buffer.from(encodedKey, "base64url");
  const actual = await scrypt(password, Buffer.from(encodedSalt, "base64url"));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function scrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeScrypt(password, salt, 64, SCRYPT_PARAMETERS, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function hashVerificationCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function generateVerificationCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function assertSesConfigured(
  mailConfig: {
    secretId: string;
    secretKey: string;
    fromAddress: string;
    templateId: number;
  },
  message = "邮件服务尚未配置，暂时无法注册",
): void {
  if (
    mailConfig.secretId.length === 0 ||
    mailConfig.secretKey.length === 0 ||
    mailConfig.fromAddress.length === 0 ||
    mailConfig.templateId <= 0
  ) {
    throw new HttpError(503, message, "SES_NOT_CONFIGURED");
  }
}

function serializeUser(user: {
  id: string;
  username: string;
  displayName: string;
  email: string;
  emailVerifiedAt: Date | null;
  role: CurrentUser["role"];
  approvalStatus: CurrentUser["approvalStatus"];
  createdAt: Date;
}): CurrentUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    emailVerified: user.emailVerifiedAt !== null,
    role: user.role,
    approvalStatus: user.approvalStatus,
    createdAt: user.createdAt.toISOString(),
  };
}

function serializeAdminUser(
  user: Parameters<typeof serializeUser>[0] & {
    reviewedAt: Date | null;
    reviewedBy: { id: string; displayName: string } | null;
  },
): AdminUser {
  return {
    ...serializeUser(user),
    reviewedAt: user.reviewedAt?.toISOString() ?? null,
    reviewedBy: user.reviewedBy,
  };
}
