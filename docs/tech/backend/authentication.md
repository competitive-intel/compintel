# 身份验证实现

## 数据模型

`User` 保存规范化用户名、显示名称、邮箱、规范化邮箱、邮箱验证时间、密码摘要、`USER | ADMIN` 角色和 `PENDING | APPROVED | REJECTED` 审核状态。`emailNormalized` 用于唯一性约束；Gmail 会去掉点号与 `+` 别名后再比较。`reviewedAt` 与 `reviewedById` 记录最近一次审核。`Session` 只保存随机会话令牌的 SHA-256 摘要、所属用户和过期时间；删除用户会级联删除会话与邮箱验证码记录。

`EmailVerification` 保存待验证用户的验证码 SHA-256、过期时间、最近发送时间和尝试次数。`SystemSettings` 以单例行保存腾讯云 SES 发件地址、模板 ID、允许的邮箱提供商域名白名单，以及 Cloudflare Turnstile Site Key / Secret Key。腾讯云 SES 的 `SecretId` / `SecretKey` 不入库，由 API 环境变量 `TENCENT_SES_SECRET_ID` / `TENCENT_SES_SECRET_KEY`（经 `packages/config` 校验）注入。

业务数据使用内部 `User.id` 建立所有权关系。API 不再接受客户端可伪造的 `x-user-id`。

## 注册与邮箱验证

注册时 API 合并环境变量中的 SES 密钥与系统设置中的发件地址、模板 ID、邮箱白名单，规范化并校验邮箱，创建 `PENDING` 用户与验证码挑战，再通过腾讯云 SES 发送验证码。邮件发送失败会删除刚创建的用户，避免留下无法验证的半成品账号。

重发验证码时先调用 SES；仅在发信成功后才 upsert 新的 `codeHash` / `sentAt`，避免发信失败导致旧码失效并进入冷却。

若注册时用户名或规范化邮箱与已有账号冲突，且对方 `emailVerifiedAt` 为空且 `createdAt` 早于 24 小时，则删除该未验证账号（级联清理会话与验证码）后允许新注册；24 小时内的冲突仍返回 `USERNAME_CONFLICT` / `EMAIL_CONFLICT`。

登录与受保护会话要求 `emailVerifiedAt` 非空且 `approvalStatus = APPROVED`。管理员审核也会拒绝尚未验证邮箱的用户。未来可关闭管理员审核门槛，仅保留邮箱验证。

### 邮箱域名白名单

白名单按**完整注册域**匹配：`domain === allowed || domain.endsWith("." + allowed)`。例如允许 `163.com` 时，`vip.163.com` 可通过，而 `gmail.com.evil.com` 不会仅因首标签为 `gmail` 而通过。存量短名（如 `gmail`）在匹配时会扩展为 `gmail.com`。

### Per-IP 发信限制与 Turnstile

API 使用 Redis 对验证邮件成功发送次数做 3 小时窗口计数（成功发送后 `INCR` 并设置 TTL）。IP 解析顺序为 `CF-Connecting-IP`、`X-Real-IP`、`X-Forwarded-For` 最左侧、最后 `req.ip`。

- 已成功发送 \> 5：后续注册发信 / 重发验证码必须通过 Turnstile（调用 Cloudflare `siteverify`）
- 已成功发送 \> 10：直接拒绝，不可用 Turnstile 绕过

相关逻辑见 `apps/api/src/email-send-limiter.ts`、`turnstile.ts`、`client-ip.ts`。

`verifyEmail`：邮箱已验证时仅返回 `{ ok: true }`，不向未认证调用者回传 `CurrentUser`；校验码成功后仍返回 `{ user }`。

## 密码与会话

密码使用 Node.js `scrypt`，参数为 N=16384、r=8、p=1，每个密码生成独立的 16 字节随机盐，派生 64 字节摘要。数据库字段以带版本信息的文本格式保存参数、盐和摘要，不保存或记录明文密码。

登录后生成 32 字节随机令牌，原始令牌仅进入 HttpOnly Cookie，数据库只保存 SHA-256 摘要。每次受保护请求同时验证会话是否存在、是否过期、邮箱是否已验证，以及用户是否仍为 `APPROVED`；因此管理员拒绝账号后，旧 Cookie 也无法继续使用。生产环境由 API 启动入口根据 `NODE_ENV=production` 为 Cookie 添加 `Secure`。

## 授权边界

认证逻辑集中在 `apps/api/src/auth.ts`。游戏目录、详情、Player 提交和评测查询都先验证审核通过的会话；写操作再使用内部用户 ID 检查所有权，评测读取则对平台内已审核用户公开。管理员接口在会话验证后继续检查 `ADMIN` 角色。不需要登录的包括健康检查、注册、登录、退出、邮箱验证、重发验证码与 `GET /v1/auth/captcha-config`；匿名 `GET /v1/games` 会返回 `401 AUTH_REQUIRED`。

当前会话采用 7 天固定有效期，不做滑动续期。后续如增加跨站部署，需要在保持 CSRF 防护的前提下重新设计 Cookie SameSite 和 CORS 策略。
