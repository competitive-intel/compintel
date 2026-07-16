# Player 评测实现

## 数据模型

当前核心关系为：

```text
Game 1 ── n Player 1 ── n PlayerVersion (subject)  1 ── n Evaluation
                       ├── PlayerVersion (opponent) 1 ── n Evaluation
                       └── n MatchParticipant n ── 1 Match
```

`Player.kind` 区分用户 Player 与平台 Player。两者都使用 `CPP`、源码摘要和源码正文，并通过不可变 `PlayerVersion` 固定实现。平台 Player 可由管理员启用或停用；源码更新会创建新版本。`Evaluation` 同时绑定被测 `playerVersionId` 和 `opponentVersionId`，`MatchParticipant` 也只引用不可变版本，避免任一方后续更新改变旧结果的可复现性。

`Match` 和 `MatchParticipant` 当前只是数据模型骨架，还没有 API、调度器或 Worker 执行链路。当前可运行的闭环是用户版本对平台版本的 `Evaluation`。

MVP 暂时把受 256 KiB 限制的源码存入 PostgreSQL，以减少首次闭环所需的外部组件。迁移到 S3/MinIO 时保留 `sourceSha256`，并将正文替换为对象键即可，API 与 Worker 边界无需改变。

## 执行流程

1. API 在事务中创建或复用用户 Player、创建新的不可变 PlayerVersion，并针对该游戏的每个启用平台 Player 创建一条 `QUEUED` Evaluation。每个平台 Player 只选择最新的 C++ 版本，同时把 Player 当前的正整数 `weight` 快照到 Evaluation 的 `opponentWeight`。创建版本前会统计该用户该游戏近 24 小时内的 `PlayerVersion` 数量，达到 50 次则拒绝并返回 `429 SUBMISSION_RATE_LIMIT`。
2. API 分别用各 Evaluation ID 作为 BullMQ job ID 投递任务，防止同一评测重复入队。
3. Worker 将状态更新为 `COMPILING`，从两个固定版本读取 C++20 源码，通过 `judge-client` 分别调用 go-judge `/run` 编译，并取得两个临时文件 ID。
4. 双方编译成功后状态更新为 `RUNNING`。Worker 通过 go-judge `/stream` 启动用户和平台对手两个独立进程，并使用 turn-control 逐回合解冻当前行动方、发送输入、收集一行输出并再次冻结。
5. Worker 通过 `apps/worker/src/games/` registry 按 `game.slug` 选择独立游戏驱动；共享的长驻进程回合循环位于同目录的 `interactive.ts`。`packages/game-core/src/games/` 按游戏分别维护完整局面、走法校验和胜负判断。合法输出被转发给另一进程，Node.js 中不包含任何平台 Player 策略。
6. Worker 保存双方各自的编译日志、运行状态和资源指标，以及用户输出、明确 verdict、是否击败对手和回放，然后终止两个会话并删除两个临时产物。
7. 每条 Evaluation 进入终态时，数据库事务锁定所属 `PlayerVersion`。当该版本的全部 Evaluation 都已结束后，写入 `floor(击败对手权重之和 / 全部对手权重之和 × 100)` 作为 0 到 100 的整数 `score`；尚有未完成任务时 `score` 保持 `null`。锁保证多条末尾评测并发完成时不会漏算。

Node.js 不会加载或直接执行用户或平台二进制。双方编译和运行均设置 CPU、墙上时间、内存、输出和进程数限制。每步 CPU、单方整局累计 CPU 与内存上限来自 Evaluation 所属游戏的可编辑设置，seed 安装的游戏默认分别为 100ms、5s 与 256MiB；另有每步 1s 墙上时间保护。墙上时间只作为阻塞保护，CPU 与墙上时间数据分别记录。

本地 go-judge 容器使用 `privileged` 和独立的 256 MiB `/dev/shm`。不要把宿主机 `/sys/fs/cgroup` 直接覆盖挂载到容器；Docker 的私有 cgroup namespace 会为特权容器提供正确的层级，覆盖后反而可能使 go-judge 创建的执行 cgroup 在进程启动前消失。

BullMQ 最多重试三次瞬时平台错误；最后一次失败会落为 `FINISHED / INTERNAL_ERROR`，不会永久停留在处理中。编译错误和用户程序错误属于正常评测结果，不触发任务重试。

API 入队和 Worker 执行过程会输出结构化阶段日志。API 使用 `requestId`，Worker 使用 `jobId`、`evaluationId` 和 `attempt` 关联一次提交与具体任务；编译、会话启动、对局结果、资源摘要、重试及清理告警均有稳定 `event` 字段。默认 `info` 不记录源码、真实走法或程序输出，临时排障可用 `LOG_LEVEL=debug` 查看逐回合资源事件。完整字段与查询方式见[结构化日志与可观测性](logging.md)。

`ACCEPTED` 表示程序遵守协议并正常完成整局对战，不要求战胜平台策略；计分只把回放终局中获胜的用户方记为击败对手。路墙棋在双方各走满 100 步仍无目标边胜负时以 `move_limit` 结束，用户方不记击败；整局墙上时间上限为 300 秒。非法走法、平局、失败、单步或累计超时、内存超限、运行错误、危险系统调用和平台错误都不会获得该对手权重。面向公开比赛的 Match 调度、排行榜、Rating 及 Rating 变更仍属于后续阶段。

API 创建数据库记录与 BullMQ 入队仍是两个外部系统操作。任一任务入队失败会把对应 Evaluation 标为 `INTERNAL_ERROR`；极端的进程崩溃窗口后续应通过 transactional outbox 和补偿扫描彻底消除。

## 公开查询模型

评测记录以不可变 `PlayerVersion` 为聚合单位，而不是把每个内置对手拆成互不相关的列表项。`GET /v1/games/:gameSlug/submissions` 分页读取已发布游戏的全部用户版本，并返回对手总数、已完成数、已击败对手数、聚合状态和最终分数。`GET /v1/submissions/:playerVersionId` 返回该版本的公开源码、分数及所有平台对手结果。

查询接口只要求已登录且未封禁的会话，不检查 Player 所有权，因此用户提交的程序可被其他平台用户查看。写接口仍检查所有权，未发布游戏和 `PLATFORM` Player 不进入公开查询。列表不返回源码正文，避免单页响应随 256 KiB 源文件和记录数量线性膨胀；详情页按单个版本读取源码。
