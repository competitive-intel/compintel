# 身份验证与用户审核 API

第一版账号系统采用“注册申请 + 管理员审核”。注册不会自动登录；只有 `APPROVED` 用户可以创建会话。会话通过服务端持久化的 HttpOnly Cookie 传递，浏览器客户端应为请求启用 credentials。

## 注册

`POST /v1/auth/register`

```json
{
  "username": "alice_01",
  "displayName": "Alice",
  "password": "password123"
}
```

用户名为 3–32 位字母、数字或下划线，服务端统一转为小写；密码为 8–128 位并同时包含字母与数字。成功返回 `201 Created`，用户的 `approvalStatus` 为 `PENDING`。用户名冲突返回 `409 USERNAME_CONFLICT`。

## 登录状态

`POST /v1/auth/login` 接收 `username` 和 `password`。审核通过后返回当前用户，并设置 `compintel_session` Cookie；Cookie 使用 `HttpOnly`、`SameSite=Lax`、`Path=/`，有效期为 7 天，生产环境额外启用 `Secure`。

待审核账号返回 `403 ACCOUNT_PENDING`，被拒绝账号返回 `403 ACCOUNT_REJECTED`，凭据错误返回 `401 INVALID_CREDENTIALS`。

- `GET /v1/auth/me`：返回当前登录用户；无有效会话返回 `401 AUTH_REQUIRED`。
- `POST /v1/auth/logout`：撤销服务端会话、清除 Cookie，成功返回 `204 No Content`。

## 管理员审核

以下接口仅允许 `role = ADMIN` 的已登录用户访问，普通用户返回 `403 ADMIN_REQUIRED`。

- `GET /v1/admin/users`：返回全部用户，包含角色、审核状态、审核时间和审核人。
- `POST /v1/admin/users/:userId/review`：请求体为 `{ "decision": "APPROVE" }` 或 `{ "decision": "REJECT" }`。拒绝用户时会撤销该用户已有的全部会话。

管理员不能审核自己的账号或其他管理员账号。不存在的目标用户返回 `404 USER_NOT_FOUND`。

## 初始化管理员

数据库 seed 从下列环境变量创建或更新初始管理员：

```text
ADMIN_USERNAME=admin
ADMIN_DISPLAY_NAME=平台管理员
ADMIN_PASSWORD=change-me-123
```

生产环境必须覆盖示例密码。未设置 `ADMIN_PASSWORD` 时，seed 会跳过管理员创建。
