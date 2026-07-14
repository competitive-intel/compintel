import {
  createHash,
  randomBytes,
  scrypt as nodeScrypt,
  timingSafeEqual,
} from "node:crypto";

import type {
  AdminUser,
  CurrentUser,
  LoginInput,
  RegisterInput,
  ReviewUserInput,
} from "@compintel/contracts";
import { Prisma, type PrismaClient } from "@compintel/db";

import { HttpError } from "./errors.js";

const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1_000;
const SCRYPT_PARAMETERS = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1_024 * 1_024 };

export interface CreatedSession {
  token: string;
  expiresAt: Date;
  user: CurrentUser;
}

export class AuthService {
  constructor(private readonly db: PrismaClient) {}

  async register(input: RegisterInput): Promise<CurrentUser> {
    const passwordHash = await hashPassword(input.password);
    try {
      const user = await this.db.user.create({
        data: {
          username: input.username,
          displayName: input.displayName,
          passwordHash,
        },
      });
      return serializeUser(user);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new HttpError(409, "用户名已被使用", "USERNAME_CONFLICT");
      }
      throw error;
    }
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
    if (user.approvalStatus === "PENDING") {
      throw new HttpError(403, "账号正在等待管理员审核", "ACCOUNT_PENDING");
    }
    if (user.approvalStatus === "REJECTED") {
      throw new HttpError(403, "账号注册申请未通过审核", "ACCOUNT_REJECTED");
    }

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
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
      session.expiresAt.getTime() <= Date.now() ||
      session.user.approvalStatus !== "APPROVED"
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

    const user = await this.db.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          approvalStatus: status,
          reviewedAt: new Date(),
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

function serializeUser(user: {
  id: string;
  username: string;
  displayName: string;
  role: CurrentUser["role"];
  approvalStatus: CurrentUser["approvalStatus"];
  createdAt: Date;
}): CurrentUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
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
