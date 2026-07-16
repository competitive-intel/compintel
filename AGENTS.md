# AGENTS.md

## 项目定位

CompIntel 是一个面向算法竞赛选手的通用 AI 对战平台。用户提交 C++ Player，平台通过独立的 go-judge 沙箱完成编译和运行，由 Worker 按游戏规则驱动双方长驻进程逐回合交互，并保存评测结果和回放。

仓库处于上线前开发阶段。修改时优先保持模型和迁移简洁，不为尚未发布的数据保留无需求的兼容层；但不要擅自重置数据库、删除用户改动或改写 Git 历史。

## 当前进度

当前已经打通五子棋 MVP 的主要闭环：

- HttpOnly Cookie 会话认证、注册、邮箱验证与管理员封禁；不再接受客户端提供的 `x-user-id`。
- 管理员维护游戏目录、发布状态以及数据库中的平台内置 C++ Player；可在系统设置中配置腾讯云 SES 发件地址/模板与允许的邮箱提供商。SES API 密钥通过环境变量 `TENCENT_SES_SECRET_ID` / `TENCENT_SES_SECRET_KEY` 配置。
- 已验证邮箱且未封禁的用户查看已发布游戏，创建 Player 或提交不可变的新版本；每个游戏 24 小时滑动窗口内最多提交 50 次。
- 每个用户版本会对同一游戏下所有启用的平台 Player 最新版本各创建一条 Evaluation。
- API 使用 BullMQ 投递任务；Worker 分别编译用户和平台 C++ 源码，并通过 go-judge `/stream` turn-control 驱动五子棋对局。
- 前端提供登录、注册、邮箱验证、游戏目录/详情、提交、公开评测列表/详情、五子棋回放、用户管理、游戏管理和系统设置页面。

尚未实现或只保留了数据模型骨架的能力包括：用户之间的正式 Match 调度、排行榜、评分及评分变更、对象存储、生产部署流水线和完整 Playwright E2E。不要在文档或代码中把这些描述为已完成。

## 技术栈与仓库结构

- Node.js 22、TypeScript strict、pnpm Workspace、Turborepo。
- `apps/web`：React 19、Vite、React Router、TanStack Query、Axios、Tailwind CSS v4、shadcn/ui 源码组件、Vitest/Testing Library。
- `apps/api`：Fastify REST API，负责认证、授权、目录管理、Player 版本和任务创建。
- `apps/worker`：BullMQ Worker，负责沙箱编译、交互对局和结果持久化。
- `packages/contracts`：前后端共享的 Zod Schema、队列常量和 TypeScript 类型。
- `packages/db`：Prisma 7 Schema、迁移、seed 和 PostgreSQL 客户端。
- `packages/game-core`：纯游戏规则、局面、落子校验和胜负判断；当前只实现五子棋。
- `packages/judge-client`：go-judge HTTP、WebSocket `/stream` 和 turn-control 封装。
- `packages/config`：API/Worker 环境变量校验。
- `services/go-judge`：独立 Git 仓库，以 Submodule 固定到特定 commit；不属于 pnpm Workspace。
- `infra`：PostgreSQL、Redis、go-judge 的本地 Compose 配置和沙箱镜像。
- `docs`：API、后端、前端和游戏协议文档，入口为 `docs/README.md`。

内部 TypeScript 包使用 `workspace:*`。`apps` 之间不得直接引用源码；共享契约或实现放入职责匹配的 `packages`。包目前直接导出 TypeScript 源码，因此本地服务应使用各 workspace 的 `dev`/`start` 脚本，不要绕过脚本执行 `dist/main.js`。

## 核心领域约束

### Player 与版本

- `Player` 是可变实体，`PlayerVersion` 是不可变实现。Evaluation 和 Match 必须绑定具体版本，不能只绑定 Player。
- `Player.kind` 为 `USER` 或 `PLATFORM`。平台内置程序不是 `game-core` 中的策略，也没有仓库内注册表；它是管理员录入数据库的特殊 C++ Player。
- 用户和平台版本当前都使用 `CPP`，源码正文与 SHA-256 暂存 PostgreSQL，单份源码最大 256 KiB。
- 更新源码必须创建递增的新版本，不能覆盖旧版本。名称、启用状态等 Player 元数据可以原地更新。
- 创建用户版本时，API 为同游戏每个 `PLATFORM + isActive=true` 的 Player 选择版本号最大的版本，并逐个创建 Evaluation。不要把多个对手合并成一个 Worker job。
- Evaluation 固定保存 `opponentVersionId`；平台 Player 后续升级或停用不得改变历史评测。
- 没有可用平台对手时拒绝提交，不创建无法执行的用户版本。

### API、认证与授权

- API 前缀为 `/v1`，健康检查为 `/health`。请求和响应必须继续使用 `packages/contracts` 的 Zod Schema 校验。
- 会话令牌只通过 HttpOnly、SameSite=Lax Cookie 传递，数据库只保存令牌 SHA-256；浏览器不得读取或持久化原始 token。
- 注册用户默认为 `USER`。受保护请求每次检查会话、过期时间、邮箱已验证且 `role !== BANNED`；管理接口还必须检查 `ADMIN` 角色。
- 当前游戏目录、详情、提交和公开评测记录都要求已登录且未封禁的用户。评测读取是平台内公开的，不按 Player 所有者隔离；写操作必须检查所有权。
- API 只创建记录并投递耗时任务，不得在 HTTP 请求中编译或运行程序。
- 当前数据库事务和 BullMQ 入队不是原子操作。入队失败应把对应 Evaluation 落为 `FINISHED / INTERNAL_ERROR`；未来再通过 outbox/补偿扫描完善。

### Worker、游戏与沙箱

- Node.js 不得使用 `child_process`、`worker_threads` 或其他本地执行方式运行任何用户或平台 C++ 程序。编译和运行统一经过 `packages/judge-client`。
- Worker 每个 Evaluation 只处理一组固定的用户版本与平台版本。双方分别编译，分别建立长驻 `/stream` 会话。
- 当前交互实现支持 `game.slug = gomoku` 与 `game.slug = quoridor`，协议分别见 `docs/tech/games/protocol/gomoku_v1.md` 和 `docs/tech/games/protocol/quoridor_v1.md`。新增目录记录不等于 Worker 自动支持新游戏；扩展游戏时必须同步增加规则核心、协议驱动、Worker 分派、测试和文档。
- `game-core` 只维护确定性的规则和状态，不包含平台对手策略、数据库、队列或沙箱代码。
- 对局必须分别限制和记录：单步 CPU、单方整局累计 CPU、单步墙上时间、内存、输出和进程数。墙上时间只是阻塞保护，不能替代 CPU 限制。
- 用户侧编译/运行/协议错误映射为明确 verdict。平台对手编译失败、非法输出或运行失败属于平台配置错误，Evaluation 应为 `INTERNAL_ERROR`。
- `ACCEPTED` 表示用户程序遵守协议并正常完成对局，不表示一定战胜平台对手。
- 对局结束后要终止双方会话并清理临时编译产物。BullMQ 瞬时平台错误最多重试三次，最终失败必须落库，不能永久停留在处理中。

### go-judge Submodule

- `services/go-judge` 有独立的 `AGENTS.md`、Go module 和提交历史。修改该目录前先阅读其指导；Go 改动在 Submodule 仓库中单独提交，再更新主仓库 gitlink。
- 当前主仓库和 `infra/compose.yaml` 固定 go-judge commit `2160a4767fe77010a036497e4246dcd41446b70f`。更新 Submodule 时同步更新镜像标签/文档，保持环境可复现。
- 当前 turn-control 依赖 Linux cgroup v2。go-judge 容器使用 `privileged: true` 和 256 MiB `/dev/shm`；不要把宿主机 `/sys/fs/cgroup` 覆盖挂载进容器。

## 数据库约定

- PostgreSQL 是当前持久化存储，Redis/BullMQ 只用于队列和临时任务状态。
- `packages/db/prisma/schema.prisma` 是模型真相源；修改后运行 Prisma generate、format，并新增或简化迁移。
- 项目尚未正式上线。数据库变更优先保持最终 Schema 和迁移历史清晰，不添加无需求的双写、旧字段回退或兼容分支。
- 不要无提示重置本地数据库。只有用户明确要求清库/重建时，才执行 `prisma migrate reset --force`，随后 seed、重启服务并做健康检查。
- seed 当前只 upsert 管理员、五子棋与路墙棋游戏目录，不安装内置 Player。管理员需通过游戏管理页面创建并启用至少一个平台 C++ Player。
- 源码和 replay 当前直接保存在 PostgreSQL。S3/MinIO 是后续方向，尚未接入运行链路；引入时应保留摘要与不可变版本语义，大对象改存对象键。

## 前端约定

- 当前路由以 `apps/web/src/App.tsx` 为准：`/login`、`/register`、`/verify-email`、`/games`、游戏详情/提交记录、评测详情、`/admin/users`、`/admin/games` 和 `/admin/settings`。
- 浏览器只访问公开 API，不直连 PostgreSQL、Redis 或 go-judge。API 客户端统一放在 `apps/web/src/lib/api.ts`，设置 `withCredentials: true` 并校验响应 Schema。
- 服务端状态使用 TanStack Query。进行中的评测允许轮询；不要在没有双向通信需求时引入新的 WebSocket 通道。
- 延续 Tailwind CSS v4 与现有 shadcn/ui 组件风格。基础组件放在 `components/ui`，页面按 `auth`、`games`、`submissions`、`admin` 领域组织。
- 本项目采用 Monorepo 结构；所有 shadcn 相关命令都必须在 `apps/web/` 目录中运行，不要在仓库根目录执行。
- 所有 `VITE_` 环境变量都会进入浏览器产物，不得包含密码、Token 或私有服务地址。默认 `/api` 由 Vite 代理到 `http://localhost:3000`。
- 新页面应覆盖加载、空数据、错误、进行中和成功等实际状态，并为关键表单与交互增加邻近的 Vitest/Testing Library 测试。

## 本地开发

环境要求以仓库清单为准：Node.js `>=22 <23`、pnpm `^11.7.0`、Docker Compose；只有维护 go-judge 时才需要本机 Go。

```bash
corepack enable
pnpm install
cp .env.example .env
docker compose -f infra/compose.yaml up -d postgres redis go-judge
set -a && source .env && set +a
pnpm db:migrate
pnpm db:seed
pnpm exec turbo run dev --env-mode=loose
```

`DATABASE_URL` 是 API、Worker、迁移和 seed 的必需变量；Worker 还需要 `REDIS_URL`、`JUDGE_URL`，API 使用 `API_HOST`、`API_PORT`。发送验证邮件还需配置 `TENCENT_SES_SECRET_ID` / `TENCENT_SES_SECRET_KEY`（可留空，但留空时无法注册发信）。seed 仅在设置 `ADMIN_PASSWORD` 时创建/更新管理员。`.env.example` 中的密码只适合本地开发。

默认地址：Web `http://127.0.0.1:5173`、API `http://127.0.0.1:3000`、go-judge `http://127.0.0.1:5050`。真实启动验证至少检查：

```bash
curl -fsS http://127.0.0.1:3000/health
curl -fsSI http://127.0.0.1:5173/
curl -fsS http://127.0.0.1:5050/version
```

游戏接口需要登录 Cookie，不能再把匿名 `GET /v1/games` 当作健康检查。

## 验证要求

根据改动范围运行最小相关检查，并在跨包契约、数据库或核心流程变更后执行全仓检查：

以下所有 pnpm 验证命令（包括 typecheck、test、build 和聚焦检查）都必须在受限沙箱外运行。pnpm 需要访问用户级 package store 及其 SQLite 索引；在沙箱内执行可能以 `ERR_SQLITE_ERROR: unable to open database file` 失败，这属于环境限制，不能视为代码或测试失败。

```bash
pnpm typecheck
pnpm test
pnpm build
```

常用聚焦命令：

```bash
pnpm --filter @compintel/web typecheck
pnpm --filter @compintel/web test
pnpm --filter @compintel/web build
pnpm --filter @compintel/api test
pnpm --filter @compintel/worker test
pnpm --filter @compintel/game-core test
pnpm --filter @compintel/judge-client test
pnpm --filter @compintel/db exec prisma format
```

Worker 单元测试使用假的沙箱/仓储即可；修改真实交互协议、资源控制或 go-judge 客户端时，还应运行需要 PostgreSQL、Redis、go-judge 和 C++ 编译器的集成流程。不要把静态检查通过描述成端到端运行已验证。

## 文档同步

`docs/README.md` 是文档索引。创建或更改以下内容时必须在同一改动中同步文档：

- API、请求/响应或权限：`docs/api/`。
- 后端模型、队列、评测或存储实现：`docs/tech/backend/`。
- 页面、路由、前端状态或组件约定：`docs/tech/web/`。
- 游戏规则、标准输入输出或资源语义：`docs/tech/games/protocol/`。

代码、Zod contracts、Prisma Schema、测试和文档必须描述同一行为。发现文档与实现冲突时，以当前代码和明确产品要求为依据修正文档，不要维持两套接口或兼容路径。

## 修改纪律

- 开始前检查 `git status`；工作区可能包含用户未提交的改动，必须保留并在其基础上工作。
- 改动尽量局限在职责所属模块。不要顺手重构无关文件，也不要生成第二套 API、队列或执行路径。
- 新依赖必须有明确收益，并符合已有包边界。优先复用现有 Schema、服务、组件和测试工具。
- TypeScript 保持 strict，不用 `any` 绕过契约；可选值需符合仓库启用的 `exactOptionalPropertyTypes`。
- 提交前格式化实际改动。Prisma 文件使用 `prisma format`；其他文件使用仓库 Prettier。
