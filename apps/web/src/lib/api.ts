import {
  adminGameListSchema,
  adminGameSchema,
  adminBuiltinPlayerListSchema,
  adminBuiltinPlayerSchema,
  adminUserSchema,
  adminUsersResponseSchema,
  authResponseSchema,
  captchaConfigSchema,
  gameDetailSchema,
  gameListSchema,
  okResponseSchema,
  playerNameListSchema,
  registerResponseSchema,
  submissionDetailSchema,
  submissionAcceptedSchema,
  submissionRecordListSchema,
  systemSettingsSchema,
  verifyEmailResponseSchema,
  type AdminGame,
  type AdminBuiltinPlayer,
  type AdminUser,
  type CaptchaConfig,
  type CreateBuiltinPlayerInput,
  type CreateBuiltinPlayerVersionInput,
  type CreatePlayerInput,
  type CurrentUser,
  type GameDetail,
  type GameSummary,
  type LoginInput,
  type RegisterInput,
  type ResendVerificationInput,
  type ReviewUserInput,
  type SubmissionAccepted,
  type SubmissionDetail,
  type SubmissionRecordList,
  type SystemSettings,
  type UpdateGameInput,
  type UpdateBuiltinPlayerInput,
  type UpdateSystemSettingsInput,
  type VerifyEmailInput,
  type VerifyEmailResponse,
} from "@compintel/contracts";
import axios, { type AxiosRequestConfig } from "axios";
import { z } from "zod";

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(
  /\/$/,
  "",
);

export const apiClient = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true,
  headers: { Accept: "application/json" },
});

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function register(input: RegisterInput): Promise<CurrentUser> {
  return (
    await request(
      { method: "POST", url: "/v1/auth/register", data: input },
      registerResponseSchema,
      "注册失败",
    )
  ).user;
}

export async function verifyEmail(
  input: VerifyEmailInput,
): Promise<VerifyEmailResponse> {
  return request(
    { method: "POST", url: "/v1/auth/verify-email", data: input },
    verifyEmailResponseSchema,
    "邮箱验证失败",
  );
}

export async function resendVerification(
  input: ResendVerificationInput,
): Promise<void> {
  await request(
    { method: "POST", url: "/v1/auth/resend-verification", data: input },
    okResponseSchema,
    "发送验证码失败",
  );
}

export async function getCaptchaConfig(
  signal?: AbortSignal,
): Promise<CaptchaConfig> {
  return request(
    { method: "GET", url: "/v1/auth/captcha-config", ...withSignal(signal) },
    captchaConfigSchema,
    "人机验证配置加载失败",
  );
}

export async function login(input: LoginInput): Promise<CurrentUser> {
  return (
    await request(
      { method: "POST", url: "/v1/auth/login", data: input },
      authResponseSchema,
      "登录失败",
    )
  ).user;
}

export async function logout(): Promise<void> {
  await request(
    { method: "POST", url: "/v1/auth/logout" },
    z.unknown(),
    "退出失败",
  );
}

export async function getCurrentUser(
  signal?: AbortSignal,
): Promise<CurrentUser> {
  return (
    await request(
      { method: "GET", url: "/v1/auth/me", ...withSignal(signal) },
      authResponseSchema,
      "登录状态加载失败",
    )
  ).user;
}

export async function getAdminUsers(
  signal?: AbortSignal,
): Promise<AdminUser[]> {
  return (
    await request(
      { method: "GET", url: "/v1/admin/users", ...withSignal(signal) },
      adminUsersResponseSchema,
      "用户列表加载失败",
    )
  ).users;
}

export async function reviewUser(
  userId: string,
  input: ReviewUserInput,
): Promise<AdminUser> {
  return request(
    {
      method: "POST",
      url: `/v1/admin/users/${encodeURIComponent(userId)}/review`,
      data: input,
    },
    adminUserSchema,
    "审核失败",
  );
}

export async function getSystemSettings(
  signal?: AbortSignal,
): Promise<SystemSettings> {
  return request(
    { method: "GET", url: "/v1/admin/system-settings", ...withSignal(signal) },
    systemSettingsSchema,
    "系统设置加载失败",
  );
}

export async function updateSystemSettings(
  input: UpdateSystemSettingsInput,
): Promise<SystemSettings> {
  return request(
    { method: "PATCH", url: "/v1/admin/system-settings", data: input },
    systemSettingsSchema,
    "保存系统设置失败",
  );
}

export async function getGames(signal?: AbortSignal): Promise<GameSummary[]> {
  return (
    await request(
      { method: "GET", url: "/v1/games", ...withSignal(signal) },
      gameListSchema,
      "游戏列表加载失败",
    )
  ).games;
}

export async function getGame(
  slug: string,
  signal?: AbortSignal,
): Promise<GameDetail> {
  return request(
    {
      method: "GET",
      url: `/v1/games/${encodeURIComponent(slug)}`,
      ...withSignal(signal),
    },
    gameDetailSchema,
    "游戏详情加载失败",
  );
}

export async function getAdminGames(
  signal?: AbortSignal,
): Promise<AdminGame[]> {
  return (
    await request(
      { method: "GET", url: "/v1/admin/games", ...withSignal(signal) },
      adminGameListSchema,
      "游戏管理列表加载失败",
    )
  ).games;
}

export async function updateGame(
  gameId: string,
  input: UpdateGameInput,
): Promise<AdminGame> {
  return request(
    {
      method: "PATCH",
      url: `/v1/admin/games/${encodeURIComponent(gameId)}`,
      data: input,
    },
    adminGameSchema,
    "保存游戏失败",
  );
}

export async function getAdminBuiltinPlayers(
  gameId: string,
  signal?: AbortSignal,
): Promise<AdminBuiltinPlayer[]> {
  return (
    await request(
      {
        method: "GET",
        url: `/v1/admin/games/${encodeURIComponent(gameId)}/builtin-players`,
        ...withSignal(signal),
      },
      adminBuiltinPlayerListSchema,
      "内置程序列表加载失败",
    )
  ).players;
}

export async function createBuiltinPlayer(
  gameId: string,
  input: CreateBuiltinPlayerInput,
): Promise<AdminBuiltinPlayer> {
  return request(
    {
      method: "POST",
      url: `/v1/admin/games/${encodeURIComponent(gameId)}/builtin-players`,
      data: input,
    },
    adminBuiltinPlayerSchema,
    "创建内置程序失败",
  );
}

export async function updateBuiltinPlayer(
  builtinPlayerId: string,
  input: UpdateBuiltinPlayerInput,
): Promise<AdminBuiltinPlayer> {
  return request(
    {
      method: "PATCH",
      url: `/v1/admin/builtin-players/${encodeURIComponent(builtinPlayerId)}`,
      data: input,
    },
    adminBuiltinPlayerSchema,
    "保存内置程序失败",
  );
}

export async function createBuiltinPlayerVersion(
  builtinPlayerId: string,
  input: CreateBuiltinPlayerVersionInput,
): Promise<AdminBuiltinPlayer> {
  return request(
    {
      method: "POST",
      url: `/v1/admin/builtin-players/${encodeURIComponent(builtinPlayerId)}/versions`,
      data: input,
    },
    adminBuiltinPlayerSchema,
    "创建新版本失败",
  );
}

export async function submitPlayer(
  gameSlug: string,
  input: CreatePlayerInput,
): Promise<SubmissionAccepted> {
  return request(
    {
      method: "POST",
      url: `/v1/games/${encodeURIComponent(gameSlug)}/players`,
      data: input,
    },
    submissionAcceptedSchema,
    "提交失败",
  );
}

export async function getPlayerNames(
  gameSlug: string,
  signal?: AbortSignal,
): Promise<string[]> {
  return (
    await request(
      {
        method: "GET",
        url: `/v1/games/${encodeURIComponent(gameSlug)}/players`,
        ...withSignal(signal),
      },
      playerNameListSchema,
      "Player 名称加载失败",
    )
  ).names;
}

export async function getSubmissionRecords(
  gameSlug: string,
  page: number,
  pageSize: number,
  signal?: AbortSignal,
): Promise<SubmissionRecordList> {
  return request(
    {
      method: "GET",
      url: `/v1/games/${encodeURIComponent(gameSlug)}/submissions`,
      params: { page, pageSize },
      ...withSignal(signal),
    },
    submissionRecordListSchema,
    "评测记录加载失败",
  );
}

export async function getSubmissionDetail(
  submissionId: string,
  signal?: AbortSignal,
): Promise<SubmissionDetail> {
  return request(
    {
      method: "GET",
      url: `/v1/submissions/${encodeURIComponent(submissionId)}`,
      ...withSignal(signal),
    },
    submissionDetailSchema,
    "评测详情加载失败",
  );
}

async function request<T>(
  config: AxiosRequestConfig,
  schema: z.ZodType<T>,
  fallbackMessage: string,
): Promise<T> {
  try {
    const response = await apiClient.request<unknown>(config);
    const result = schema.safeParse(response.data);
    if (!result.success) {
      throw new ApiError("服务返回了无法识别的数据", response.status, null);
    }
    return result.data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (axios.isAxiosError(error)) {
      throwApiErrorFromBody(
        error.response?.status ?? 0,
        error.response?.data,
        fallbackMessage,
      );
    }
    throw new ApiError(fallbackMessage, 0, null);
  }
}

function throwApiErrorFromBody(
  status: number,
  body: unknown,
  fallbackMessage: string,
): never {
  const result = z
    .object({ message: z.string(), code: z.string().optional() })
    .safeParse(body);
  throw new ApiError(
    result.success ? result.data.message : fallbackMessage,
    status,
    result.success ? (result.data.code ?? null) : null,
  );
}

function withSignal(signal: AbortSignal | undefined) {
  return signal === undefined ? {} : { signal };
}
