# CompIntel

CompIntel 是一个面向算法竞赛选手的通用 AI 对战平台。参赛者使用 C++ 编写并提交 Player，平台在受限沙箱中完成编译和运行，驱动长驻进程逐回合对战，并保存评测结果与回放。

> 项目已支持手动部署，当前已打通五子棋 MVP 的账号审核、游戏目录、Player 提交、多平台对手评测、加权分数和回放闭环；自动部署流水线尚未提供。

## 核心能力

- HttpOnly Cookie 会话、注册申请与管理员审核
- 管理游戏目录、用户 Player 与数据库中的平台 C++ Player
- 为每个不可变 Player 版本向全部启用平台对手分别创建异步 Evaluation
- 隔离运行不可信的 C++ 程序，并限制时间、内存、输出和进程数量
- 记录对局结果、异常原因、资源摘要、加权评测分数和五子棋回放
- 提供登录、注册、游戏目录/详情、提交、公开评测、回放和管理页面

当前 Worker 只实现五子棋。用户之间的正式 Match 调度、排行榜、Rating 及其变更、对象存储和完整 Playwright E2E 仍未实现；数据库中的 Match 相关模型只是骨架。部署方式请参阅 [DEPLOY.md](DEPLOY.md)。

## 技术架构

项目使用 pnpm Workspace 与 Turborepo 组织 Monorepo：

- `apps/web`：React、Vite、TypeScript 前端
- `apps/api`：Fastify HTTP API
- `apps/worker`：基于 BullMQ 的异步任务 Worker
- `packages/contracts`：共享的 Zod Schema 与接口类型
- `packages/db`：Prisma Schema、迁移与数据库客户端
- `packages/game-core`：游戏状态、规则、操作校验与胜负判断
- `packages/judge-client`：go-judge 接口封装
- `packages/config`：服务端环境变量读取与校验
- `services/go-judge`：以 Git Submodule 引入的沙箱服务 fork
- `infra`：本地开发与部署配置

持久数据保存在 PostgreSQL，当前源码和 replay 也直接存于其中；Redis 与 BullMQ 负责任务队列；编译产物是 go-judge 中的临时文件，评测结束后删除。对象存储尚未接入。所有不可信程序都必须经由 `packages/judge-client` 交给 go-judge，Node.js 服务不会直接执行用户或平台 C++ 代码。

## 环境要求

- Node.js 22 LTS
- pnpm 11（仓库声明的兼容版本为 `^11.7.0`）
- Docker 与 Docker Compose
- Go（仅在开发或构建 go-judge 时需要）

## 开始使用

克隆仓库及其 Submodule：

```bash
git clone --recurse-submodules <repository-url>
cd compintel
```

如果仓库已经克隆，可单独初始化沙箱 Submodule：

```bash
git submodule update --init --recursive
```

启用 Corepack 并安装 Monorepo 依赖：

```bash
corepack enable
pnpm install
```

启动本地依赖并初始化数据库：

```bash
docker compose -f infra/compose.yaml up -d postgres redis go-judge
cp .env.example .env
# 修改 .env 中的 ADMIN_PASSWORD，生产环境禁止使用示例密码
set -a && source .env && set +a
pnpm db:migrate
pnpm db:seed
```

分别启动 API 与 Worker：

```bash
pnpm --filter @compintel/api dev
pnpm --filter @compintel/worker dev
```

启动 Web SPA（默认访问 `http://localhost:5173`）：

```bash
pnpm --filter @compintel/web dev
```

先使用 seed 创建的管理员登录，在“游戏管理”页面维护游戏目录和数据库中的内置 C++ 程序。至少启用一个平台程序后，已验证邮箱的用户即可从游戏详情页提交 C++ Player，并在公开评测记录中查看所有用户的不可变源码版本及平台对手结果。管理员可在“用户管理”页面封禁或解封账号。身份验证接口见 `docs/api/authentication.md`，游戏与内置程序接口见 `docs/api/games.md`，Player 提交与公开评测接口见 `docs/api/player-evaluations.md`。运行 `pnpm typecheck` 和 `pnpm test` 可执行仓库的静态检查与测试。

## 开发约定

- `apps` 之间不直接引用源码；共享实现放入 `packages`，并使用 `workspace:*` 引用。
- API 只创建耗时任务，编译和对战由 Worker 异步处理。
- 前端只访问 API，不直接连接 PostgreSQL、Redis 或 go-judge。
- Evaluation 同时绑定用户和平台对手的不可变 PlayerVersion，确保历史结果可复现。
- 生产环境使用由固定 go-judge commit 构建的镜像，不使用无法追溯的 `latest` 标签。
