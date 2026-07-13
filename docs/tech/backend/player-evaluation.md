# Player 评测实现

## 数据模型

当前核心关系为：

```text
Game 1 ── n Player 1 ── n PlayerVersion (subject)  1 ── n Evaluation
                       ├── PlayerVersion (opponent) 1 ── n Evaluation
                       └── n MatchParticipant n ── 1 Match
```

`Player.kind` 区分用户 Player 与平台策略。平台策略也有不可变版本，但使用 `BUILTIN` 语言和 `implementationKey` 定位 `packages/builtin-players` 中注册的平台实现；用户版本使用 `CPP`、源码摘要和源码正文。`Evaluation` 同时绑定被测 `playerVersionId` 和 `opponentVersionId`，`MatchParticipant` 也只引用不可变版本，避免平台策略或用户 Player 后续更新改变旧结果的可复现性。

MVP 暂时把受 256 KiB 限制的源码存入 PostgreSQL，以减少首次闭环所需的外部组件。迁移到 S3/MinIO 时保留 `sourceSha256`，并将正文替换为对象键即可，API 与 Worker 边界无需改变。

## 执行流程

1. API 在事务中创建或更新用户、Player、PlayerVersion 和 `QUEUED` Evaluation。
2. API 用 Evaluation ID 作为 BullMQ job ID 投递任务，防止同一评测重复入队。
3. Worker 将状态更新为 `COMPILING`，通过 `judge-client` 调用 go-judge 的 `/run` 编译 C++20 源码，并取得 go-judge 临时文件 ID。
4. 编译成功后状态更新为 `RUNNING`。Worker 通过 go-judge `/stream` 启动一次用户进程，并使用 turn-control 逐回合解冻进程、输入对手走法、收集一行输出并再次冻结。
5. Worker 按 Evaluation 所绑定对手版本的 `implementationKey` 从内置实现注册表加载 Player。`game-core` 只维护完整棋盘、校验走法和判断胜负，不包含任何具体 Player 策略。
6. Worker 让用户版本与该内置 Player 版本完成一局实际对战；当前种子版本的行为是“四连围堵，否则随机空位”。
7. Worker 保存累计资源指标和明确 verdict，然后终止会话并删除 go-judge 临时产物。

Node.js 不会加载或直接执行用户二进制。编译和运行均设置 CPU、墙上时间、内存、输出和进程数限制。每步 CPU 上限为 100ms、整局累计 CPU 上限为 5s，另有每步 1s 墙上时间保护。墙上时间只作为阻塞保护，CPU 与墙上时间数据分别记录。平台策略的随机选择由 Evaluation ID 派生种子，同一次评测可复现。

本地 go-judge 容器使用 `privileged` 和独立的 256 MiB `/dev/shm`。不要把宿主机 `/sys/fs/cgroup` 直接覆盖挂载到容器；Docker 的私有 cgroup namespace 会为特权容器提供正确的层级，覆盖后反而可能使 go-judge 创建的执行 cgroup 在进程启动前消失。

BullMQ 最多重试三次瞬时平台错误；最后一次失败会落为 `FINISHED / INTERNAL_ERROR`，不会永久停留在处理中。编译错误和用户程序错误属于正常评测结果，不触发任务重试。

`ACCEPTED` 表示程序遵守协议并正常完成整局对战，不要求战胜平台策略。非法走法、单步或累计超时、内存超限、运行错误、危险系统调用和平台错误使用不同 verdict。当前 Evaluation 保存用户标准输出序列和资源摘要；面向公开比赛的 Match 调度、对象存储完整回放和评分更新仍属于后续阶段。

API 创建数据库记录与 BullMQ 入队仍是两个外部系统操作。入队失败会把 Evaluation 标为 `INTERNAL_ERROR`；极端的进程崩溃窗口后续应通过 transactional outbox 和补偿扫描彻底消除。
