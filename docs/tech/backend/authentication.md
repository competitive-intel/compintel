# 身份验证实现

## 数据模型

`User` 保存规范化用户名、显示名称、密码摘要、`USER | ADMIN` 角色和 `PENDING | APPROVED | REJECTED` 审核状态。`reviewedAt` 与 `reviewedById` 记录最近一次审核。`Session` 只保存随机会话令牌的 SHA-256 摘要、所属用户和过期时间；删除用户会级联删除会话。

业务数据使用内部 `User.id` 建立所有权关系。API 不再接受客户端可伪造的 `x-user-id`。

## 密码与会话

密码使用 Node.js `scrypt`，参数为 N=16384、r=8、p=1，每个密码生成独立的 16 字节随机盐，派生 64 字节摘要。数据库字段以带版本信息的文本格式保存参数、盐和摘要，不保存或记录明文密码。

登录后生成 32 字节随机令牌，原始令牌仅进入 HttpOnly Cookie，数据库只保存 SHA-256 摘要。每次受保护请求同时验证会话是否存在、是否过期，以及用户是否仍为 `APPROVED`；因此管理员拒绝账号后，旧 Cookie 也无法继续使用。生产环境由 API 启动入口根据 `NODE_ENV=production` 为 Cookie 添加 `Secure`。

## 授权边界

认证逻辑集中在 `apps/api/src/auth.ts`。游戏目录、详情、Player 提交和评测查询都先验证审核通过的会话；写操作再使用内部用户 ID 检查所有权，评测读取则对平台内已审核用户公开。管理员接口在会话验证后继续检查 `ADMIN` 角色。不需要登录的只有健康检查、注册、登录和退出；匿名 `GET /v1/games` 会返回 `401 AUTH_REQUIRED`。

当前会话采用 7 天固定有效期，不做滑动续期。后续如增加跨站部署，需要在保持 CSRF 防护的前提下重新设计 Cookie SameSite 和 CORS 策略。
