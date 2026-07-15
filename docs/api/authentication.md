# 身份验证与用户审核 API

第一版账号系统采用“邮箱验证 + 管理员审核”。注册不会自动登录；用户需先验证邮箱，再等待管理员审核；只有 `emailVerified` 且 `APPROVED` 的用户可以创建会话。会话通过服务端持久化的 HttpOnly Cookie 传递，浏览器客户端应为请求启用 credentials。

## 注册

`POST /v1/auth/register`

```json
{
  "username": "alice_01",
  "displayName": "Alice",
  "email": "alice@gmail.com",
  "password": "password123"
}
```

用户名为 3–32 位字母、数字或下划线，服务端统一转为小写；密码为 8–128 位并同时包含字母与数字；邮箱必须属于管理员配置的允许提供商（默认 `gmail`、`qq`、`163`、`126`）。成功返回 `201 Created`，用户的 `approvalStatus` 为 `PENDING`，`emailVerified` 为 `false`，并发送 6 位邮箱验证码。

冲突与限制：

- 用户名冲突返回 `409 USERNAME_CONFLICT`
- 规范化后的邮箱冲突返回 `409 EMAIL_CONFLICT`
- 邮箱提供商不在白名单返回 `400 EMAIL_PROVIDER_NOT_ALLOWED`
- 邮件服务未配置返回 `503 SES_NOT_CONFIGURED`
- 验证邮件发送失败返回 `502 EMAIL_SEND_FAILED`

Gmail 会做特殊规范化：忽略 local 部分中的点号与 `+` 别名，并将 `googlemail.com` 视为 `gmail.com`，以避免同一邮箱注册多个账号。

## 邮箱验证

- `POST /v1/auth/verify-email`：请求体为 `{ "username": "alice_01", "code": "123456" }`。成功后将邮箱标记为已验证，用户仍保持 `PENDING` 等待审核。
- `POST /v1/auth/resend-verification`：请求体为 `{ "username": "alice_01" }`。60 秒内不可重复发送。

常见错误码：`VERIFICATION_INVALID`、`VERIFICATION_EXPIRED`、`VERIFICATION_RESEND_COOLDOWN`、`VERIFICATION_ATTEMPTS_EXCEEDED`、`EMAIL_ALREADY_VERIFIED`。

验证码邮件通过腾讯云 SES 发送，模板 ID 在系统设置中配置，模板占位符为 `username` 与 `verifyCode`。

## 登录状态

`POST /v1/auth/login` 接收 `username` 和 `password`。邮箱已验证且审核通过后返回当前用户，并设置 `compintel_session` Cookie；Cookie 使用 `HttpOnly`、`SameSite=Lax`、`Path=/`，有效期为 7 天，生产环境额外启用 `Secure`。

未验证邮箱返回 `403 EMAIL_UNVERIFIED`，待审核账号返回 `403 ACCOUNT_PENDING`，被拒绝账号返回 `403 ACCOUNT_REJECTED`，凭据错误返回 `401 INVALID_CREDENTIALS`。

- `GET /v1/auth/me`：返回当前登录用户；无有效会话返回 `401 AUTH_REQUIRED`。
- `POST /v1/auth/logout`：撤销服务端会话、清除 Cookie，成功返回 `204 No Content`。

当前用户对象包含 `email` 与 `emailVerified`。

## 管理员审核

以下接口仅允许 `role = ADMIN` 的已登录用户访问，普通用户返回 `403 ADMIN_REQUIRED`。

- `GET /v1/admin/users`：返回全部用户，包含邮箱、邮箱验证状态、角色、审核状态、审核时间和审核人。
- `POST /v1/admin/users/:userId/review`：请求体为 `{ "decision": "APPROVE" }` 或 `{ "decision": "REJECT" }`。拒绝用户时会撤销该用户已有的全部会话。尚未完成邮箱验证的用户不能审核，返回 `400 EMAIL_UNVERIFIED`。

管理员不能审核自己的账号或其他管理员账号。不存在的目标用户返回 `404 USER_NOT_FOUND`。

## 系统设置

- `GET /v1/admin/system-settings`：返回腾讯云 SES SecretId、发件地址、模板 ID、允许的邮箱提供商，以及 `tencentSesSecretKeyConfigured`（是否已配置 SecretKey）。不会回传明文 SecretKey。
- `PATCH /v1/admin/system-settings`：可更新 `tencentSesSecretId`、`tencentSesSecretKey`、`tencentSesFromAddress`、`tencentSesTemplateId`、`allowedEmailProviders`。省略 `tencentSesSecretKey` 表示保留原值；传空字符串表示清空。

## 初始化管理员

数据库 seed 从下列环境变量创建或更新初始管理员：

```text
ADMIN_USERNAME=admin
ADMIN_DISPLAY_NAME=平台管理员
ADMIN_PASSWORD=change-me-123
```

管理员邮箱默认为 `{username}@compintel.local`，并视为已验证。存量用户迁移同样回填为 `{username}@compintel.local`。生产环境必须覆盖示例密码。未设置 `ADMIN_PASSWORD` 时，seed 会跳过管理员创建。
