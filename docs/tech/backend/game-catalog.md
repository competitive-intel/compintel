# 游戏目录实现

游戏目录使用 `Game` 模型作为规则实现、提交和展示内容的稳定入口。`slug` 是公开 URL 标识，创建后不可修改；`rulesVersion` 标识当前对外规则版本。`summary` 用于列表，`description` 用于简短介绍，`rulesMarkdown` 以一份 Markdown 同时保存完整规则和程序通信协议。`moveCpuLimitMs`、`totalCpuLimitMs` 和 `memoryLimitMiB` 保存双方共用的可编辑评测资源限制。

## 发布边界

游戏目录由 seed 等源代码安装，管理 API 不提供创建操作。每个游戏的 seed 元数据分别位于 `packages/db/prisma/games/`，由同目录 registry 统一提供给 `seed.ts`。用户目录、详情查询及 Player 提交都要求 `isPublished=true`，因此管理员可以编辑已安装游戏的展示内容并控制发布。下架使用同一字段，不物理删除记录，避免破坏 Player、评测和对局外键。

`GameService` 集中处理目录查询、序列化与更新：

- 参赛者接口只返回已发布记录，并不泄露草稿状态和管理时间戳；
- 管理员接口返回完整记录；
- 更新通过数据库 id 定位，但不接受 slug 字段。

所有输入和响应都使用 `packages/contracts/src/game.ts` 的 Zod Schema 校验。Worker 从 Evaluation 所属游戏读取资源限制，并在启动用户与平台双方长驻沙箱时换算为 go-judge 使用的纳秒和字节。目录字段的数据库变更位于 `20260713030000_game_catalog` 和 `20260714000000_game_resource_limits` 迁移。

`rulesMarkdown` 最大 60,000 字符。服务端只保存和返回原文，不在 API 内渲染；前端使用关闭原始 HTML 的 `markdown-it` 解析，并通过 KaTeX 插件渲染行内和块级公式。游戏 replay 的 Zod Schema 分别位于 `packages/contracts/src/games/`，再由目录入口组成判别联合，避免通用评测契约随游戏数量持续堆叠。

## 当前边界

目录保存文本元数据、资源限制与发布状态，不把具体规则代码或内置程序写入 `Game`。新增游戏不是单纯的数据录入：必须同步实现 `packages/game-core` 规则、Worker 分派、交互协议、测试和文档，并在 seed 中安装目录记录。平台内置程序仍作为关联的 `PLATFORM` Player 和不可变 C++ 版本单独管理。
