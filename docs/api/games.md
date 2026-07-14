# 游戏目录 API

游戏目录保存面向参赛者公开的游戏介绍，以及合并后的游戏规则与程序通信协议 Markdown。所有接口使用 JSON，并要求通过 `compintel_session` Cookie 登录；管理员接口还要求当前用户角色为 `ADMIN`。

## 获取已发布游戏

`GET /v1/games`

只返回 `isPublished=true` 的游戏。响应示例：

```json
{
  "games": [
    {
      "id": "game-id",
      "slug": "example-game",
      "name": "示例游戏",
      "summary": "列表页使用的简短介绍。",
      "rulesVersion": "example-v1",
      "resourceLimits": {
        "moveCpuLimitMs": 100,
        "totalCpuLimitMs": 5000,
        "memoryLimitMiB": 256
      }
    }
  ]
}
```

## 获取游戏详情

`GET /v1/games/:gameSlug`

只允许读取已发布游戏。除列表字段外，响应还包含：

```json
{
  "description": "游戏背景和平台评测方式。",
  "rulesMarkdown": "## 基本规则\n\n规则正文。\n\n## 程序通信协议\n\n协议正文。"
}
```

`rulesMarkdown` 使用 Markdown 语法。公式支持 `$...$`、`$$...$$`、`\\(...\\)` 和 `\\[...\\]` 分隔符，由前端使用 KaTeX 渲染；原始 HTML 不会执行。

游戏不存在或仍是草稿时返回 `404 GAME_NOT_FOUND`。

## 管理游戏

`GET /v1/admin/games` 返回全部游戏，包括草稿，并额外包含 `isPublished`、`createdAt` 和 `updatedAt`。

管理 API 不提供创建游戏的接口。新增游戏必须修改 seed、规则核心、Worker 分派、协议测试和文档等对应源代码，再通过部署或数据库重建安装，不能通过管理页面直接插入一条目录记录。

`PATCH /v1/admin/games/:gameId` 修改除 `slug` 外的任意字段；请求体至少包含一个字段。`resourceLimits` 必须完整提供 `moveCpuLimitMs`、`totalCpuLimitMs` 和 `memoryLimitMiB`，整局 CPU 限制不得小于单步限制。将 `isPublished` 设为 `false` 会立即从参赛者目录隐藏游戏，并禁止创建新提交，但不会删除已有数据。

## 管理内置 C++ 程序

内置程序接口均要求管理员权限。平台程序与用户程序使用相同的 C++20 编译环境、沙箱限制和游戏通信协议。

`GET /v1/admin/games/:gameId/builtin-players` 返回该游戏的全部平台 Player。每项包含 `name`、`isActive`、正整数 `weight`、`versionCount`，以及带完整源码、SHA-256 和创建时间的 `latestVersion`。

`POST /v1/admin/games/:gameId/builtin-players` 创建平台 Player 和第一个不可变版本：

```json
{
  "name": "基准程序",
  "sourceCode": "#include <iostream>\nint main() { /* ... */ }",
  "isActive": true,
  "weight": 1
}
```

`PATCH /v1/admin/builtin-players/:builtinPlayerId` 修改名称、`isActive` 或 `weight`。停用后只是不再加入新提交的评测；权重修改也只影响之后创建的 Evaluation，已经排队或完成的 Evaluation 使用其快照权重。

`POST /v1/admin/builtin-players/:builtinPlayerId/versions` 使用 `{ "sourceCode": "..." }` 创建源码新版本。版本号由服务端在串行化事务中递增；请求不会覆盖历史源码。源码与当前版本相同时返回 `409 BUILTIN_PLAYER_SOURCE_UNCHANGED`，并发版本冲突返回 `409 BUILTIN_PLAYER_VERSION_CONFLICT`。

同一游戏的内置程序名称重复时返回 `409 BUILTIN_PLAYER_NAME_CONFLICT`。源码不能为空，最大 256 KiB；权重必须是正整数，创建时省略则默认为 `1`。
