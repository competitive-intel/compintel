# Player 提交、评测记录与详情 API

所有接口使用 JSON，并通过登录后获得的 `compintel_session` HttpOnly Cookie 验证用户。游戏必须已经发布。已审核用户可以查看所有用户提交的源码与评测结果；提交时 API 只会创建或复用当前用户自己的 Player。

## 提交 Player 程序

`POST /v1/games/:gameSlug/players`

请求体：

```json
{
  "name": "center-bot",
  "sourceCode": "#include <iostream>\nint main() { return 0; }"
}
```

成功后返回 `202 Accepted`：

```json
{
  "playerId": "player-id",
  "playerVersionId": "version-id",
  "version": 1,
  "evaluationIds": ["evaluation-id"],
  "evaluationStatus": "QUEUED"
}
```

同一用户在同一游戏中首次使用某个名称时创建 Player 和版本 1；再次使用相同名称调用此接口时复用该 Player，并自动创建当前最大版本号加 1 的不可变版本。不同用户可以使用相同名称，一份程序由游戏、用户、Player 名称和版本号共同确定。源码不能为空，最大 256 KiB。API 为所有已启用平台 Player 的最新 C++ 版本分别创建评测；没有可用平台程序时返回 `503 EVALUATION_OPPONENT_UNAVAILABLE`。

## 查询当前用户已用 Player 名称

`GET /v1/games/:gameSlug/players`

返回当前用户在该游戏中使用过的全部 Player 名称，按名称升序排列，供提交页自动补全：

```json
{
  "names": ["center-bot", "defense-bot"]
}
```

## 按游戏查询公开评测记录

`GET /v1/games/:gameSlug/submissions?page=1&pageSize=20`

- `page` 默认为 `1`。
- `pageSize` 默认为 `20`，最大为 `50`。
- 记录按提交时间倒序排列，每个不可变 PlayerVersion 是一条记录。

响应：

```json
{
  "submissions": [
    {
      "id": "version-id",
      "playerId": "player-id",
      "playerName": "center-bot",
      "version": 2,
      "language": "CPP",
      "author": {
        "id": "user-id",
        "username": "alice",
        "displayName": "Alice"
      },
      "status": "RUNNING",
      "evaluationSummary": {
        "total": 3,
        "finished": 2,
        "won": 1
      },
      "score": null,
      "createdAt": "2026-07-13T08:00:00.000Z"
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 1
}
```

聚合状态为 `QUEUED`、`RUNNING` 或 `FINISHED`。`won` 表示该版本已经击败的平台对手数量，不按对手权重折算；`score` 在全部 Evaluation 完成前为 `null`，完成后为 `floor(击败对手权重之和 / 全部对手权重之和 × 100)`。

## 查询公开评测详情

`GET /v1/submissions/:playerVersionId`

详情响应包含列表记录的全部字段，以及游戏摘要、完整公开源码、源码摘要和该版本绑定的所有平台对手评测：

```json
{
  "id": "version-id",
  "playerId": "player-id",
  "playerName": "center-bot",
  "version": 2,
  "language": "CPP",
  "author": {
    "id": "user-id",
    "username": "alice",
    "displayName": "Alice"
  },
  "status": "FINISHED",
  "evaluationSummary": { "total": 1, "finished": 1, "won": 1 },
  "score": 100,
  "createdAt": "2026-07-13T08:00:00.000Z",
  "game": {
    "slug": "gomoku",
    "name": "五子棋",
    "rulesVersion": "gomoku-v1"
  },
  "sourceCode": "#include <iostream>\nint main() { return 0; }",
  "sourceSha256": "...64 位十六进制摘要...",
  "evaluations": [
    {
      "id": "evaluation-id",
      "opponentVersionId": "platform-version-id",
      "opponentName": "基准程序",
      "opponentVersion": 3,
      "opponentWeight": 5,
      "won": true,
      "status": "FINISHED",
      "verdict": "ACCEPTED",
      "compileStatus": "Accepted",
      "compileLog": "",
      "runStatus": "Accepted",
      "stdout": "7 7\n",
      "stderr": "",
      "cpuTimeNs": "1000000",
      "wallTimeNs": "2000000",
      "memoryBytes": "1048576",
      "errorMessage": null,
      "replay": null,
      "createdAt": "2026-07-13T08:00:00.000Z",
      "startedAt": "2026-07-13T08:00:01.000Z",
      "finishedAt": "2026-07-13T08:00:02.000Z"
    }
  ]
}
```

评测状态依次为 `QUEUED`、`COMPILING`、`RUNNING`、`FINISHED`。终态 verdict 包括 `ACCEPTED`、`COMPILE_ERROR`、`RUNTIME_ERROR`、`TIME_LIMIT_EXCEEDED`、`MEMORY_LIMIT_EXCEEDED`、`OUTPUT_LIMIT_EXCEEDED`、`DANGEROUS_SYSCALL`、`INVALID_MOVE` 和 `INTERNAL_ERROR`。

CPU 时间、墙上时间和内存使用十进制字符串表示，避免 JavaScript JSON 精度损失。当前五子棋评测完成后可返回棋盘尺寸、用户席位、全部落子和规则结果组成的 `replay`；其他游戏的回放结构将在对应规则引擎接入时扩展。

`opponentWeight` 是 Evaluation 创建时的平台对手权重快照，`won` 表示该局是否由用户方获胜。之后调整内置 Player 的权重不会回改历史分数。

## 公开边界

公开表示所有已登录且审核通过的用户均可读取，不要求是提交所有者。未发布游戏及平台内置 Player 源码不通过这些接口公开。接口只返回用户 Player 的不可变版本，保证已展示的源码与历史评测严格对应。

五子棋通信协议见[五子棋交互协议 v1](../tech/games/protocol/gomoku_v1.md)。
