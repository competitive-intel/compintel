# 身份验证与用户管理 API

第一版账号系统采用邮箱验证。注册不会自动登录；用户验证邮箱后即可登录。会话通过服务端持久化的 HttpOnly Cookie 传递，浏览器客户端应为请求启用 credentials。用户角色为 `USER | BANNED | ADMIN`；被封禁账号无法登录或保持会话。

## 注册

`POST /v1/auth/register`

```json
{
  "username": "alice_01",
  "displayName": "Alice",
  "email": "alice@gmail.com",
  "password": "password123",
  "turnstileToken": "optional-when-required"
}
```

用户名为 3–32 位字母、数字或下划线，服务端统一转为小写；密码为 8–128 位并同时包含字母与数字；邮箱必须匹配管理员配置的允许域名（默认 `gmail.com`、`qq.com`、`163.com`、`126.com`，按完整注册域/后缀匹配，合法子域如 `vip.163.com` 可通过）。成功返回 `201 Created`，用户的 `role` 为 `USER`，`emailVerified` 为 `false`，并发送 6 位邮箱验证码。

`turnstileToken` 为可选字段：当该客户端 IP 在 3 小时窗口内发信预留计数已超过 5 时必须提供，并由 Cloudflare Turnstile siteverify 校验。

冲突与限制：

- 用户名冲突返回 `409 USERNAME_CONFLICT`
- 规范化后的邮箱冲突返回 `409 EMAIL_CONFLICT`
- 若冲突对象为超过 24 小时仍未验证邮箱、且未被封禁的账号，注册会删除该旧账号后允许重注册；已封禁账号不会被回收
- 邮箱提供商不在白名单返回 `400 EMAIL_PROVIDER_NOT_ALLOWED`
- 邮件服务未配置返回 `503 SES_NOT_CONFIGURED`
- 验证邮件发送失败返回 `502 EMAIL_SEND_FAILED`
- IP 发信超过 5 封且未通过人机验证返回 `429 TURNSTILE_REQUIRED`
- Turnstile 校验失败返回 `400 TURNSTILE_FAILED`
- 需要 Turnstile 但系统未配置返回 `503 TURNSTILE_NOT_CONFIGURED`
- IP 发信超过 10 封返回 `429 EMAIL_SEND_IP_BLOCKED`

Gmail 会做特殊规范化：忽略 local 部分中的点号与 `+` 别名，并将 `googlemail.com` 视为 `gmail.com`，以避免同一邮箱注册多个账号。

## 邮箱验证

- `POST /v1/auth/verify-email`：请求体为 `{ "username": "alice_01", "code": "123456" }`。验证码有效期 5 分钟。校验通过后返回 `{ "user": … }`，之后即可登录。若该用户邮箱已验证，返回 `{ "ok": true }`（不泄露用户资料），不要求验证码。
- `POST /v1/auth/resend-verification`：请求体为 `{ "username": "alice_01", "turnstileToken"?: "…" }`。60 秒内不可重复发送。发信成功后才更新验证码哈希与冷却时间（新码同样有效期 5 分钟）；发信失败保留旧码。成功返回 `{ "ok": true }`。同样受 per-IP Turnstile / 封堵规则约束。
- `GET /v1/auth/captcha-config`：公开返回 `{ "turnstileSiteKey": "…" | null }`，供前端在需要时渲染 Turnstile widget。

常见错误码：`VERIFICATION_INVALID`、`VERIFICATION_EXPIRED`、`VERIFICATION_RESEND_COOLDOWN`、`VERIFICATION_ATTEMPTS_EXCEEDED`、`EMAIL_ALREADY_VERIFIED`、`TURNSTILE_REQUIRED`、`TURNSTILE_FAILED`、`TURNSTILE_NOT_CONFIGURED`、`EMAIL_SEND_IP_BLOCKED`。

验证码邮件通过腾讯云 SES 发送，模板 ID 在系统设置中配置，模板占位符为 `username` 与 `verifyCode`。

### Per-IP 发信限制

客户端 IP 由 `apps/api/src/client-ip.ts` 解析，优先级：`CF-Connecting-IP` → `X-Real-IP` → `X-Forwarded-For`（最左侧）→ Fastify `req.ip`。推荐部署拓扑为 Cloudflare → Caddy → API：边缘由 Cloudflare 写入 `CF-Connecting-IP`，源站应透传该头且限制仅接受 Cloudflare 回源，避免直连伪造。当前实现固定优先该头，尚无独立的 `TRUSTED_CLIENT_IP_HEADER` 环境变量。计数保存在 Redis（键 TTL 约 3 小时）：发信**前**原子 `INCR` 预留名额，再按预留后的计数判定门槛；SES/发信失败或门禁拒绝时 `DECR` 回滚（计数不会减到负值，也不重置 TTL）。成功发送则保留预留。

| 3 小时内预留后计数 | 行为                            |
| ------------------ | ------------------------------- |
| ≤ 5                | 允许发信，无需 Turnstile        |
| \> 5 且 ≤ 10       | 必须提供有效 `turnstileToken`   |
| \> 10              | 拒绝发信，不可用 Turnstile 绕过 |

## 登录状态

`POST /v1/auth/login` 接收 `username` 和 `password`。邮箱已验证且账号未被封禁时返回当前用户，并设置 `compintel_session` Cookie；Cookie 使用 `HttpOnly`、`SameSite=Lax`、`Path=/`，有效期为 7 天，生产环境额外启用 `Secure`。

未验证邮箱返回 `403 EMAIL_UNVERIFIED`，被封禁账号返回 `403 ACCOUNT_BANNED`，凭据错误返回 `401 INVALID_CREDENTIALS`。

- `GET /v1/auth/me`：返回当前登录用户；无有效会话返回 `401 AUTH_REQUIRED`。
- `POST /v1/auth/logout`：撤销服务端会话、清除 Cookie，成功返回 `204 No Content`。

当前用户对象包含 `email`、`emailVerified` 与 `role`。

## 管理员用户管理

以下接口仅允许 `role = ADMIN` 的已登录用户访问，普通用户返回 `403 ADMIN_REQUIRED`。唯一管理员由 seed 创建；当前不提供将用户提升为管理员的接口。

- `GET /v1/admin/users`：返回全部用户，包含邮箱、邮箱验证状态、角色与总提交次数（该用户所有 `USER` Player 的 `PlayerVersion` 总数）。
- `POST /v1/admin/users/:userId/ban`：将 `USER` 设为 `BANNED`，并撤销该用户全部会话。
- `POST /v1/admin/users/:userId/unban`：将 `BANNED` 设回 `USER`。

不能封禁或解封自己的账号，也不能操作管理员账号。相关错误码：`CANNOT_BAN_SELF`、`CANNOT_BAN_ADMIN`、`USER_ALREADY_BANNED`、`USER_NOT_BANNED`、`USER_NOT_FOUND`。

## 系统设置

- `GET /v1/admin/system-settings`：返回发件地址、模板 ID、允许的邮箱提供商域名、Turnstile Site Key，以及 `tencentSesCredentialsConfigured`（环境变量 `TENCENT_SES_SECRET_ID` / `TENCENT_SES_SECRET_KEY` 是否已配置）与 `turnstileSecretKeyConfigured`。不会回传明文密钥。
- `PATCH /v1/admin/system-settings`：可更新 `tencentSesFromAddress`、`tencentSesTemplateId`、`allowedEmailProviders`、`turnstileSiteKey`、`turnstileSecretKey`。省略 Turnstile Secret 表示保留原值；传空字符串表示清空。SES API 密钥不通过此接口读写。

## 初始化管理员与 SES 密钥

数据库 seed 从下列环境变量创建或更新初始管理员：

```text
ADMIN_USERNAME=admin
ADMIN_DISPLAY_NAME=平台管理员
ADMIN_PASSWORD=change-me-123
```

管理员邮箱默认为 `{username}@compintel.local`，并视为已验证。存量用户迁移同样回填为 `{username}@compintel.local`。生产环境必须覆盖示例密码。未设置 `ADMIN_PASSWORD` 时，seed 会跳过管理员创建。

腾讯云 SES API 密钥由 API 进程环境变量提供（见 `packages/config`），不写入数据库：

```text
TENCENT_SES_SECRET_ID=
TENCENT_SES_SECRET_KEY=
```

留空时无法发送验证邮件。发件地址、模板 ID 与邮箱白名单仍由管理员在系统设置中配置。
