# 内置 C++ Player

## 定位与数据模型

内置程序是 `Player.kind = PLATFORM` 的特殊 Player。它们与用户 Player 一样使用 `language = CPP` 的不可变 `PlayerVersion`，源码正文和 SHA-256 摘要保存在数据库中；仓库不再包含平台策略源码、实现注册表或 `implementationKey`。

`Player.isActive` 控制一个平台 Player 是否参与新提交的评测，正整数 `Player.weight` 表示击败该对手对提交得分的贡献，越高级的对手应配置越高权重。停用不会删除 Player、历史版本或已有 Evaluation。管理员修改源码时不会覆盖当前版本，而是创建版本号递增的新 `PlayerVersion`；已经创建的 Evaluation 始终引用原来的 `opponentVersionId`，并快照创建时的 `opponentWeight`，因此后台后续修改源码、权重或启用状态都不会改变历史评测口径。

种子脚本只创建游戏目录和可选管理员，不安装任何内置程序。新环境必须由管理员在游戏管理页面录入 C++ 源码，避免平台策略重新变成仓库配置。

## 选择与执行

创建用户版本时，API 枚举同一游戏下所有 `PLATFORM + isActive=true` 的 Player，并为每个 Player 选择版本号最大的 C++ 版本。每个对手分别创建一条 Evaluation。没有启用的内置程序时，提交返回 `503 EVALUATION_OPPONENT_UNAVAILABLE`。

Worker 从 Evaluation 固定绑定的用户版本和平台版本读取两份 C++ 源码，分别通过 `judge-client` 交给 go-judge 编译，再启动两个独立的 `/stream` 会话。Node.js 只负责按游戏规则转发每回合输入、校验双方输出和记录回放，不加载或直接执行任何一方程序。

两方使用相同的单步 CPU、累计 CPU、墙上时间、内存、输出和进程数限制。用户程序的编译、运行或非法操作映射为对应 verdict；平台对手编译失败、输出非法或运行失败属于平台配置错误，评测保存为 `INTERNAL_ERROR`。Evaluation 分别保存双方的编译状态、编译日志、运行状态和资源摘要，便于管理员定位有问题的平台版本。

## 管理约束

- 名称在同一游戏的平台 Player 中唯一。
- C++ 源码不能为空且最大 256 KiB。
- 保存与当前版本完全相同的源码会返回冲突，不创建无意义版本。
- 名称、启用状态和正整数权重可以原地更新；源码只能通过新版本更新。
- 新评测只选最新版本，历史版本只用于已经绑定它的 Evaluation；Match 目前只有数据模型骨架，尚未接入运行链路。
- 平台程序与用户程序都必须遵守游戏详情页公布的同一通信协议。
