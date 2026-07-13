# Player 提交与评测 API

当前 API 提供五子棋 Player 的最小提交闭环。所有接口使用 JSON；除健康检查和游戏列表外，当前开发阶段通过 `x-user-id` 请求头标识用户。这个请求头只是认证适配器的临时边界，生产环境接入登录系统后应由认证插件写入可信用户身份，不能直接信任客户端提供的值。

## 提交新 Player

`POST /v1/games/:gameSlug/players`

请求头：

```text
x-user-id: local-user-1
content-type: application/json
```

请求体：

```json
{
  "name": "center-bot",
  "sourceCode": "#include <iostream>\nint main(){ std::cout << \"7 7\\n\"; }"
}
```

成功后返回 `202 Accepted`：

```json
{
  "playerId": "...",
  "playerVersionId": "...",
  "version": 1,
  "evaluationId": "...",
  "evaluationStatus": "QUEUED"
}
```

Player 名称在同一用户、同一游戏内唯一。源码不能为空，最大为 256 KiB。

## 提交新版本

`POST /v1/players/:playerId/versions`

请求头同上，请求体只包含 `sourceCode`。只有 Player 所有者可以提交版本。每次请求都会创建新的不可变 `PlayerVersion` 和独立 `Evaluation`，成功响应格式与首次提交相同。

## 查询评测

`GET /v1/evaluations/:evaluationId`

请求必须携带 Player 所有者的 `x-user-id`。响应中的 `status` 依次为 `QUEUED`、`COMPILING`、`RUNNING`、`FINISHED`。`FINISHED` 时 `verdict` 为下列值之一：

- `ACCEPTED`
- `COMPILE_ERROR`
- `RUNTIME_ERROR`
- `TIME_LIMIT_EXCEEDED`
- `MEMORY_LIMIT_EXCEEDED`
- `OUTPUT_LIMIT_EXCEEDED`
- `DANGEROUS_SYSCALL`
- `INVALID_MOVE`
- `INTERNAL_ERROR`

CPU 时间、墙上时间和内存分别通过 `cpuTimeNs`、`wallTimeNs` 和 `memoryBytes` 返回。它们使用十进制字符串表示，避免 JavaScript JSON 数值精度损失。编译日志、标准输出和标准错误也会随结果返回，并已在沙箱请求中限制大小。

响应中的 `opponentVersionId` 是本次评测绑定的内置对手版本。即使平台之后增加或升级内置策略，已经创建的评测仍使用原来的不可变版本。

## 五子棋 Player 协议 v1

程序会在同一个沙箱进程中完成整局多轮交互。初始化输入为：

```text
1
15 15
<seat>
```

`seat = 0` 是白方先手，读完初始化后直接输出第一步；`seat = 1` 是黑方后手，初始化后会先收到白方坐标。此后每轮先收到一行对手坐标，再输出并刷新一行自己的坐标：

```text
<X> <Y>
```

完整的角色定义、生命周期、规则、资源限制和示例见[五子棋交互协议 v1](../tech/games/protocol/gomoku_v1.md)。

## 其他接口

- `GET /health`：服务存活检查。
- `GET /v1/games`：列出当前游戏。
