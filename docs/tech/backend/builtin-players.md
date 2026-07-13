# 内置 Player 实现

## 定位

内置策略是 `PlayerKind.PLATFORM` 的特殊 Player，而不是游戏规则的一部分。`packages/game-core` 只负责状态、规则、走法校验和胜负判断；所有平台策略实现放在独立的 `packages/builtin-players` 包中。

数据库中的每个内置 `PlayerVersion` 使用：

- `language = BUILTIN`；
- 不可变且全局唯一语义的 `implementationKey`，例如 `gomoku:block-four-random:v1`；
- 递增的 Player 版本号。

实现行为发生变化时必须创建新文件、新 `implementationKey` 和新 `PlayerVersion`，不能原地修改旧 key 的语义。旧实现需要继续保留，直到所有引用它的 Evaluation、Match 和回放都不再要求复现。

## 注册与执行

`packages/builtin-players/src/registry.ts` 是实现注册表。Worker 从 Evaluation 绑定的 `opponentVersionId` 读取 `implementationKey`，再按游戏 slug 和 key 解析实现。每局对战由版本化实现描述符创建一个独立 Player 实例，允许策略保存局内状态，同时避免并发 Evaluation 共享可变状态。未知 key 或游戏不匹配属于平台配置错误，不会退回到“最新实现”。

创建 Evaluation 时，API 根据当前评测策略选择一个已安装的内置 PlayerVersion，并把其 ID 写入 `opponentVersionId`。因此更新默认对手只影响之后创建的 Evaluation。

新增内置 Player 的步骤：

1. 在对应游戏目录新增带版本后缀的实现，并定义新的 `implementationKey`。
2. 将实现加入注册表。
3. 在数据库 seed 或管理流程中创建对应的 PLATFORM PlayerVersion。
4. 如需作为默认评测对手，更新 API 的评测对手选择配置。
5. 为策略行为、注册解析和完整对局补充测试。
