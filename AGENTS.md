# AGENTS.md

## 项目简述

本项目是一个面向算法竞赛选手的通用 AI 对战平台。用户可以使用 C++ 编写 AI 程序并提交到平台，系统负责在受限环境中编译程序，并依据指定游戏规则，让不同用户提交的 AI 自动进行对局。平台需要支持代码版本管理、编译状态、创建对局、对局调度、胜负判定、异常处理、回放记录、排行榜及评分系统等功能，并为未来增加不同游戏规则预留扩展能力。

项目采用 Monorepo 组织除沙箱以外的代码，包管理和任务编排使用 pnpm Workspace 与 Turborepo。前端使用 React、Vite 和 TypeScript，负责代码提交、AI 管理、比赛信息、对局回放和排行榜等界面；后端使用 Node.js、TypeScript 和 Fastify，分为面向用户请求的 API 服务与负责耗时任务的 Worker 服务。PostgreSQL 用于保存用户、AI 版本、提交、编译结果、比赛和评分等持久数据；Redis 与 BullMQ 用于调度编译和对战任务；完整源码、编译产物及对局录像可保存到 S3 或 MinIO。

不可信的 C++ 程序不得由 Node.js 直接运行，而是统一交给基于 criyle/go-judge 修改的沙箱服务。go-judge 是基于 criyle/go-judge 维护的独立 fork，拥有独立的 Git 仓库和提交历史，并通过 Git Submodule 引入主仓库的 services/go-judge 目录。主仓库固定引用 go-judge 的特定 commit，以保证评测环境可复现；本地开发可直接从 Submodule 构建沙箱，生产环境则部署由该 commit 构建的固定版本 Docker 镜像。

## 技术栈

### 基础环境

* **Node.js 22 LTS**：前端工具链、API 服务和 Worker 的运行环境。
* **TypeScript**：前后端及共享包统一使用 TypeScript，并启用严格类型检查。
* **pnpm Workspace**：管理 Monorepo 内的依赖和内部包引用。
* **Turborepo**：统一执行开发、构建、测试、类型检查和代码检查任务。
* **Go**：仅用于维护 `services/go-judge` 沙箱服务。
* 各工具的具体版本以根目录 `package.json`、`pnpm-lock.yaml`、`go.mod` 和 Docker 镜像标签为准。

### Monorepo 结构

* `apps/web`：React 前端应用。
* `apps/api`：面向前端的 HTTP API 服务。
* `apps/worker`：处理代码编译、AI 对局和评分更新等异步任务。
* `packages/contracts`：前后端共享的数据结构、Zod Schema 和接口类型。
* `packages/db`：数据库 Schema、迁移文件和数据库客户端。
* `packages/game-core`：与具体游戏有关的状态、规则、操作校验和胜负判断。
* `packages/judge-client`：对 go-judge 接口的统一封装。
* `packages/config`：服务端环境变量的读取与校验。
* `services/go-judge`：通过 Git Submodule 引入的 go-judge fork，不属于 pnpm Workspace。
* `infra`：Docker Compose、沙箱挂载和其他部署配置。

内部 TypeScript 包使用 `workspace:*` 引用。`apps` 之间不得直接互相引用源代码；需要共享的实现应提取到 `packages` 中。

### 前端

* **React**：构建用户界面。
* **Vite**：开发服务器与生产构建工具。
* **React Router**：管理前端路由。
* **TanStack Query**：管理 API 请求、缓存、轮询和服务端状态。
* **Zod**：校验 API 数据，并与 `packages/contracts` 共享 Schema。
* **Vitest + React Testing Library**：前端单元测试与组件测试。
* **Playwright**：关键用户流程的端到端测试。

前端只能访问公开 API，不得直接连接 PostgreSQL、Redis、对象存储或 go-judge。任何带有 `VITE_` 前缀的环境变量都视为公开信息，不得包含密码、Token 或内部服务地址。

### API 服务

* **Node.js + TypeScript**：API 运行环境。
* **Fastify**：HTTP 服务框架。
* **Zod**：请求参数、请求体、响应数据和环境变量校验。
* **Prisma ORM**：访问 PostgreSQL并管理数据库迁移。
* **Pino**：结构化日志；优先使用 Fastify 内置的日志实例。

API 服务负责身份认证、权限检查、AI 与代码版本管理、比赛信息、排行榜和任务创建。编译或对战等耗时操作必须投递给 BullMQ，不得阻塞 HTTP 请求，也不得直接执行用户程序。

前端与 API 默认使用 REST/JSON 通信。对局状态初期可以通过轮询获取；需要实时推送时优先使用 SSE，确有双向通信需求时再引入 WebSocket。

### 异步任务

* **Redis**：任务队列和临时状态存储。
* **BullMQ**：编译、对战、评分更新等异步任务的调度与重试。
* **Node.js Worker**：消费 BullMQ 任务，协调数据库、对象存储和 go-judge。

### 数据与存储

* **PostgreSQL**：保存用户、AI、AI 版本、提交、编译结果、比赛、参赛方、评分及评分变更记录。
* **Prisma Migrate**：管理数据库结构变更。
* **S3 兼容对象存储**：保存源代码、编译产物、标准错误输出和完整对局录像。
* **MinIO**：本地开发环境中的 S3 兼容实现。

比赛必须绑定具体且不可变的 AI 版本，不能只绑定可变的 AI 实体。数据库保存对局摘要和对象存储地址；较大的源码、二进制文件、日志和逐步录像不直接写入数据库。

### 沙箱与评测

* **go-judge fork**：编译和运行所有不可信 C++ 程序。
* **Docker**：构建并部署固定版本的 go-judge 镜像。
* **Linux cgroup、namespace、rlimit 和 seccomp**：提供资源限制与进程隔离。
* **HTTP/流式接口**：Worker 与 go-judge 之间的通信方式。

Node.js 服务不得使用 `child_process`、`worker_threads` 或其他方式直接执行用户提交的程序。所有编译和运行操作必须经过 `packages/judge-client` 调用 go-judge。

对战评测至少需要分别记录和限制：

* 单步 CPU 时间；
* 单个 AI 的整局累计 CPU 时间；
* 单步墙上时间；
* 内存使用量；
* 输出大小；
* 进程数量。

墙上时间只能作为防止进程永久阻塞的额外限制，不能替代 CPU 时间。对局需要正确区分正常结束、非法操作、单步超时、总时间超限、内存超限、运行错误、危险系统调用和平台内部错误。

### 开发与部署

* **Docker Compose**：在本地启动 PostgreSQL、Redis、MinIO 和 go-judge。
* **Docker 镜像**：分别构建 API、Worker、Web 和 go-judge。
* **Git Submodule**：固定主仓库使用的 go-judge commit。
* **ESLint + Prettier**：代码检查与格式化。
* **GitHub Actions**：执行安装、类型检查、测试、构建和镜像发布。

开发环境可以从 `services/go-judge` 直接构建沙箱镜像；生产环境必须使用由特定 commit 构建的固定版本镜像，不使用无法追溯的 `latest` 标签。生产环境只允许 Web 和 API 对公网开放，PostgreSQL、Redis、MinIO、Worker 和 go-judge 必须位于私有网络中。

## 文档

在开发过程中，我们需要时刻维护一个文档列表，保存在 `docs/` 目录下。这个目录下有多个子目录，例如：

* `docs/api/` 下保存 API 文档。
* `docs/tech/` 下保存技术细节文档。

每个子目录分为多个小类，如 `docs/tech/web/` 保存前端的技术细节实现文档等。

当你在创建新 API、新页面或更改实现时，请同步更新文档。
