# 结构化日志与可观测性

API 和 Worker 统一使用 `packages/logger` 提供的 Pino logger。服务日志写到标准输出，每条日志是一行 JSON，便于 systemd、Docker 或集中式日志平台直接采集，不再依赖零散的 `console.log`。

## 配置

两个服务共享以下环境变量：

| 变量        | 默认值        | 说明                                                                     |
| ----------- | ------------- | ------------------------------------------------------------------------ |
| `NODE_ENV`  | `development` | 允许 `development`、`test`、`production`，同时写入日志的 `environment`。 |
| `LOG_LEVEL` | `info`        | 允许 `fatal`、`error`、`warn`、`info`、`debug`、`trace` 或 `silent`。    |

生产环境通常保持 `LOG_LEVEL=info`。排查单局评测时可临时切到 `debug`；该级别会记录每回合的行动方、turn-control 事件类型、CPU/墙上时间和输入输出字节数，日志量明显更大。回合日志不会记录实际输入、输出或走法正文。

## 公共字段与关联方式

每条日志都包含：

- `time`：ISO 8601 时间。
- `level`：Pino 数值级别。
- `service`：`compintel-api` 或 `compintel-worker`。
- `environment`、`pid`、`hostname`、`msg`。
- `component`：产生日志的模块，例如 `http`、`submission-service`、`evaluation-processor`。
- `event`：业务、生命周期和异常日志使用的稳定机器可查询事件名；普通 Fastify 请求开始/完成日志除外。

API 为每个请求设置 `requestId`。客户端提供 `X-Request-Id` 时沿用该值，否则生成 UUID；响应始终回传 `X-Request-Id`。同一次请求的开始、完成、业务写操作与异常日志都使用同一 ID。

Worker 使用 `jobId`、`evaluationId`、`attempt` 关联 BullMQ 任务与具体 Evaluation。评测阶段日志还包含 `gameSlug`、`side`、`verdict`、`durationMs`；资源摘要统一以 `cpuTimeMs`、`wallTimeMs` 和 `memoryMiB` 输出。

## 关键事件

API 的默认 `info` 日志包括 Fastify 请求开始/完成，以及注册、登录、邮箱验证、管理员写操作、提交落库和每条 Evaluation 入队。API 启动、提交完成或管理员读取状态时会检查 BullMQ 消费者；状态变化为无 Worker 时记录 `queue.no_workers` warning，恢复时记录 `queue.workers_available`，Redis 查询失败时记录 `queue.worker_status_check_failed`。客户端参数错误和普通权限拒绝只在 `debug` 级别记录业务错误码；服务不可用使用 `warn`，未处理异常使用 `error` 并保留堆栈。

Worker 的默认 `info` 日志覆盖：

1. Worker 启动、关闭和 BullMQ job 激活/完成。
2. Evaluation 加载与资源限制。
3. 用户和平台双方编译开始、完成状态、耗时及资源摘要。
4. 双方长驻沙箱会话启动、Evaluation 进入 `RUNNING`。
5. 对局 verdict、是否获胜、走子数、双方运行状态和资源摘要。
6. 结果落库、任务重试耗尽、stalled job 与 Worker/Redis 错误。

临时编译产物删除成功只在 `debug` 记录；删除失败使用 `warn`，但保持现有评测结果语义，不把清理告警改写成用户 verdict。

## 敏感信息边界

共享 logger 对认证头、Cookie、`set-cookie`、密码、会话/Turnstile Token、验证码、云密钥和 `sourceCode` 等已知字段做统一脱敏。HTTP logger 不记录请求体。业务日志只写 ID、状态、计数和资源摘要，不写邮箱、源码、真实走法、编译日志、stdout 或 stderr。

编译日志、程序输出和 stderr 仍按原有模型保存到 PostgreSQL，并通过有权限的评测详情接口读取；它们不是服务运行日志。新增日志时仍应主动选择安全字段，不能把自动脱敏当成记录任意请求对象或配置对象的许可。

## 查询示例

systemd 部署下可直接查看单行 JSON：

```bash
journalctl -u compintel-api -o cat -f
journalctl -u compintel-worker -o cat -f
```

安装 `jq` 后可按关联 ID 或级别筛选：

```bash
journalctl -u compintel-api -o cat | jq 'select(.requestId == "<request-id>")'
journalctl -u compintel-worker -o cat | jq 'select(.evaluationId == "<evaluation-id>")'
journalctl -u compintel-worker -o cat | jq 'select(.level >= 40)'
```
