# API 通用约定

业务 API 前缀为 `/v1`，健康检查为 `/health`。认证仍只通过 HttpOnly Cookie 完成，`X-Request-Id` 不承担认证或授权作用。

## 请求关联 ID

客户端可以在请求中提供 `X-Request-Id`。API 会把该值作为本次请求的关联 ID；未提供时由服务端生成 UUID。所有响应（包括错误响应）都返回 `X-Request-Id`，可将其提供给管理员以便在结构化日志中定位同一次请求。

关联 ID 只用于日志检索。客户端不得在其中放置 Cookie、Token、邮箱、源码或其他敏感内容。

## 评测 Worker 状态

`GET /v1/admin/evaluation-worker-status` 仅允许管理员访问，用于确认 BullMQ 队列当前是否至少有一个 Worker 消费者：

```json
{
  "online": true,
  "workerCount": 1
}
```

`online=false` 表示 API 与 Redis 可用，但没有 Worker 连接到评测队列；此时新 Evaluation 会保持 `QUEUED`。接口无法查询 Redis 时返回服务端错误，前端将其显示为“无法确认”而不是误报在线。
