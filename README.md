# CompIntel

CompIntel 是一个面向算法竞赛选手的通用 AI 对战平台。参赛者使用 C++ 编写并提交 AI，平台在受限沙箱中完成编译和运行，自动调度对局、判定结果，并保存回放与评分记录。

> 项目目前处于早期开发阶段，目录和基础依赖已就位，功能正在逐步实现。

## 核心能力

- 管理 AI、源码版本、编译状态和不可变的参赛版本
- 调度编译、对战与评分更新等异步任务
- 隔离运行不可信的 C++ 程序，并限制时间、内存、输出和进程数量
- 记录对局结果、异常原因、完整回放与排行榜变化
- 通过独立的游戏核心包扩展新的游戏规则

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

持久数据保存在 PostgreSQL；Redis 与 BullMQ 负责任务队列；源码、编译产物和对局录像保存到 S3 兼容对象存储。所有不可信程序都必须经由 `packages/judge-client` 交给 go-judge，Node.js 服务不会直接执行用户代码。

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

根目录脚本、本地基础设施和各应用入口仍在建设中；可用命令请以根目录 `package.json` 为准。

## 开发约定

- `apps` 之间不直接引用源码；共享实现放入 `packages`，并使用 `workspace:*` 引用。
- API 只创建耗时任务，编译和对战由 Worker 异步处理。
- 前端只访问公开 API，不直接连接数据库、Redis、对象存储或 go-judge。
- 比赛绑定不可变的 AI 版本，确保结果和评测环境可复现。
- 生产环境使用由固定 go-judge commit 构建的镜像，不使用无法追溯的 `latest` 标签。
