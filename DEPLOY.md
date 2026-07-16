# CompIntel 手动部署指南

本文说明如何在一台 Linux 主机上部署当前版本的 CompIntel。项目已经支持手动部署；仓库暂未提供自动构建、自动发布或自动回滚的 CI/CD 流水线，因此升级需要按本文步骤执行。

当前部署范围是五子棋和路墙棋 MVP：用户注册与邮箱验证、账号封禁、游戏目录、平台 C++ Player、异步评测、公开评测详情和回放。正式 Match 调度、排行榜、Rating、对象存储等功能仍不在当前运行链路中。

## 1. 部署拓扑

推荐将 Web、API、Worker 和基础设施部署在同一台 Linux 主机上。默认公网入口为 **Cloudflare（边缘）→ Caddy（源站）**：

```text
浏览器 -- HTTPS --> Cloudflare
                       |
                       v
                     Caddy（本机，TLS 终结或由 CF Flexible/Full 配合）
                       |-- /       --> apps/web/dist（静态文件）
                       `-- /api/*  --> API 127.0.0.1:3000（剥离 /api 前缀）

API :3000 ----> PostgreSQL :5432
             `-> Redis :6379 -> Worker
Worker ------> go-judge :5050
```

只有 Caddy（或经 Cloudflare Tunnel 暴露的等价入口）应对公网/Cloudflare 可达。PostgreSQL、Redis 和 go-judge 只应监听本机或私有网络；go-judge 绝不能直接暴露给互联网。若使用云数据库或托管 Redis，只需将 `DATABASE_URL`、`REDIS_URL` 指向对应服务。

源站应限制为仅接受 Cloudflare 回源（防火墙允许 Cloudflare IP、Authenticated Origin Pulls，或 Cloudflare Tunnel），避免客户端绕过边缘直接伪造 `CF-Connecting-IP`。

## 2. 主机要求

- Linux 主机，Docker 使用 cgroup v2；go-judge 需要容器 `privileged` 权限。
- Node.js 22 LTS（版本范围 `>=22 <23`）。
- pnpm 11，仓库当前锁定的包管理器版本为 `11.12.0`。
- Docker Engine 和 Docker Compose v2。
- Git，并能拉取 `services/go-judge` Submodule。
- 一个已经配置 HTTPS 的域名（推荐 Cloudflare 代理 + 本机 Caddy）。生产 Cookie 在 `NODE_ENV=production` 时带 `Secure`，必须通过 HTTPS 访问。
- 源站反向代理：默认使用 Caddy；也可用 Nginx（见下文附录）。

go-judge 镜像会在容器中安装 `g++`，主机不需要单独安装 C++ 编译器。不要在 macOS 或 Windows 上把本指南当作生产部署方案；go-judge 的资源隔离以 Linux 为目标。

## 3. 获取代码和安装依赖

```bash
git clone --recurse-submodules <repository-url> compintel
cd compintel

# 已有工作区时确保 Submodule 已初始化
git submodule update --init --recursive

corepack enable
corepack prepare pnpm@11.12.0 --activate
pnpm install --frozen-lockfile
```

部署前应确认 Submodule 处于仓库锁定的 commit。`infra/compose.yaml` 当前固定使用 go-judge commit `2160a4767fe77010a036497e4246dcd41446b70f` 对应的镜像标签。

## 4. 配置环境变量

复制模板并为生产环境填写值：

```bash
cp .env.example .env
chmod 600 .env
```

至少需要配置以下变量：

```dotenv
DATABASE_URL=postgresql://<user>:<password>@<postgres-host>:5432/compintel
REDIS_URL=redis://<user>:<password>@<redis-host>:6379/0
LOG_LEVEL=info

API_HOST=127.0.0.1
API_PORT=3000
NODE_ENV=production

TENCENT_SES_SECRET_ID=<腾讯云 SES SecretId>
TENCENT_SES_SECRET_KEY=<腾讯云 SES SecretKey>

JUDGE_URL=http://127.0.0.1:5050
JUDGE_AUTH_TOKEN=<按 go-judge 配置填写；无认证时留空>

ADMIN_USERNAME=admin
ADMIN_DISPLAY_NAME=平台管理员
ADMIN_PASSWORD=<随机且足够长的管理员密码>

# 同源反向代理时保持为 /api
VITE_API_BASE_URL=/api
```

`LOG_LEVEL` 默认为 `info`；只应在短期排查评测回合时切到 `debug`，因为逐回合资源日志会显著增加输出量。`VITE_*` 变量会被写入浏览器静态产物，只能放公开地址，不能放数据库密码、Token 或内部服务地址。`ADMIN_PASSWORD` 只在 seed 时使用，生产环境不要使用 `.env.example` 中的示例值。`TENCENT_SES_SECRET_*` 仅供 API 进程读取，不要写入前端或数据库；发件地址与模板 ID 仍在管理后台系统设置中配置。

## 5. 启动 PostgreSQL、Redis 和 go-judge

同机使用仓库提供的 Compose：

```bash
docker compose -f infra/compose.yaml up -d --build postgres redis go-judge
docker compose -f infra/compose.yaml ps
```

当前 Compose 文件默认将 `5432`、`6379` 和 `5050` 映射到所有网卡。生产环境应在部署前将端口映射改为仅本机，例如：

```yaml
ports:
  - "127.0.0.1:5432:5432"
```

对 Redis 和 go-judge 采用相同做法，或者删除端口映射并让应用加入专用 Docker 网络。若使用外部 PostgreSQL/Redis，则不需要启动对应的 Compose 服务。

检查基础设施：

```bash
docker compose -f infra/compose.yaml ps
curl -fsS http://127.0.0.1:5050/version
```

如果 go-judge 无法启动，先检查 Docker 是否启用 cgroup v2、是否允许 `privileged: true`，以及主机是否有足够的 `/dev/shm`；Compose 已为它配置 `256m` 的共享内存。

## 6. 初始化数据库

从项目根目录加载环境变量后执行 Prisma Client 生成、迁移和 seed：

```bash
set -a
source .env
set +a

pnpm db:generate
pnpm --filter @compintel/db exec prisma migrate deploy
pnpm db:seed
```

`migrate deploy` 只应用仓库中已经提交的迁移，不会在服务器上生成新迁移。seed 是幂等且只新增数据的：它创建缺失的默认系统设置、可选管理员、五子棋与路墙棋目录；已经存在的记录会被跳过，不会覆盖管理员修改的游戏设置，也不会重置已有管理员的资料或密码。它不会自动创建平台 C++ Player。首次登录管理员后，需要在“游戏管理”页面添加并启用至少一个平台 Player，否则用户提交会被拒绝。

不要把 `prisma migrate reset` 用于生产环境；该命令会删除数据库中的用户、源码、评测结果和回放。

## 7. 构建并启动应用

先执行仓库级构建，尽早发现跨包类型或生成代码问题：

```bash
pnpm build
```

API 和 Worker 当前通过 workspace 的 `start` 脚本运行（脚本使用 `tsx` 加载 TypeScript 源码），应交给 systemd、Supervisor 或其他进程管理器托管，保持自动重启和日志收集。最小启动命令如下：

```bash
pnpm --filter @compintel/api start
pnpm --filter @compintel/worker start
```

两个命令需要分别作为常驻服务运行，不能依赖 SSH 会话。使用 systemd 时，为 API 和 Worker 各创建一个 service，设置：

- `WorkingDirectory=/srv/compintel`
- `EnvironmentFile=/srv/compintel/.env`
- `Restart=on-failure`
- `ExecStart` 使用 `command -v pnpm` 返回的绝对路径，并分别执行上面的 `start` 命令

下面是 API unit 的模板；Worker unit 只需将 `ExecStart` 中的 filter 改为 `@compintel/worker`：

```ini
[Unit]
Description=CompIntel API
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=compintel
WorkingDirectory=/srv/compintel
EnvironmentFile=/srv/compintel/.env
ExecStart=/usr/local/bin/pnpm --filter @compintel/api start
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

将 `/usr/local/bin/pnpm` 替换为 `command -v pnpm` 的实际路径，并将 unit 文件分别保存到 `/etc/systemd/system/compintel-api.service` 和 `/etc/systemd/system/compintel-worker.service`。

例如完成 unit 文件后：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now compintel-api compintel-worker
sudo systemctl status compintel-api compintel-worker
```

Web 构建为静态文件：

```bash
VITE_API_BASE_URL=/api pnpm --filter @compintel/web build
```

将 `apps/web/dist` 交给 Caddy（默认）或同类静态文件服务器。不要在生产环境使用 Vite 开发服务器；`pnpm --filter @compintel/web preview` 只适合临时验收。

反向代理必须同时满足两点：将 `/api/v1/*` 转发到 API 的 `/v1/*`（剥离 `/api` 前缀），并对 SPA 路由回退到 `apps/web/dist/index.html`。

### Cloudflare + Caddy（推荐）

域名在 Cloudflare 开启代理（橙云）。源站用 Caddy 提供静态站与 `/api` 反代。`handle_path /api/*` 会去掉 `/api` 前缀，与前端 `VITE_API_BASE_URL=/api` 一致：`/api/health` → `http://127.0.0.1:3000/health`，`/api/v1/...` → `/v1/...`。

API 解析客户端 IP 时优先读取 Cloudflare 写入的 `CF-Connecting-IP`（见 `apps/api/src/client-ip.ts`）。Caddy 应透传该头，**不要**用客户端可控字段覆盖或伪造它；也不要在反代里删除 `CF-Connecting-IP`。

核心 `Caddyfile` 形态如下（将域名与 `root` 换成实际路径；TLS 可用 Caddy 自动证书，或在 Cloudflare 全橙云时按站点策略调整）：

```caddyfile
example.com {
	root * /srv/compintel/apps/web/dist
	encode gzip

	# /api/* → API，剥离 /api 前缀（等价于 Nginx proxy_pass .../;）
	handle_path /api/* {
		reverse_proxy 127.0.0.1:3000 {
			header_up Host {host}
			header_up X-Forwarded-Proto {http.request.scheme}
			# 透传 CF-Connecting-IP；勿 header_up 覆盖该头
		}
	}

	# SPA：找不到静态文件时回退 index.html
	handle {
		try_files {path} /index.html
		file_server
	}
}
```

可选：`redir /api /api/` 以对齐带尾斜杠的习惯。若 Caddy 同时终结 TLS 且 Cloudflare 为 Full (strict)，确保证书受信任。

### 附录：也可用 Nginx

若不用 Caddy，也可用 Nginx 承担同源反代与静态站（能力等价）。在 Cloudflare 之后部署时同样应透传 `CF-Connecting-IP`，并限制源站仅接受 Cloudflare 回源：

```nginx
root /srv/compintel/apps/web/dist;

location = /api { return 308 /api/; }
location /api/ {
    proxy_pass http://127.0.0.1:3000/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    # remote_addr 多为 Cloudflare 边缘 IP；真实客户端见 CF-Connecting-IP
    proxy_set_header X-Real-IP $remote_addr;
}

location / {
    try_files $uri $uri/ /index.html;
}
```

## 8. 首次上线验收

```bash
curl -fsS https://<domain>/api/health
curl -fsSI https://<domain>/
sudo systemctl --no-pager status compintel-api compintel-worker
docker compose -f infra/compose.yaml ps
```

然后按产品流程做一次真实验收：

1. 使用 seed 创建的管理员登录。
2. 在“游戏管理”中确认五子棋已发布，并创建、启用至少一个平台 C++ Player。
3. 注册普通用户并由管理员批准。
4. 提交一个小型 C++ Player，确认 Worker 能创建并完成评测。
5. 打开公开评测详情，确认源码、对手结果和回放可读。

## 9. 升级流程

升级前先备份数据库，并确认当前评测队列已处理完或接受短暂暂停：

```bash
set -a; source .env; set +a
pg_dump "$DATABASE_URL" --format=custom --file="/var/backups/compintel-$(date +%Y%m%d-%H%M%S).dump"

git fetch --tags origin
git checkout <release-commit-or-tag>
git submodule update --init --recursive
pnpm install --frozen-lockfile

pnpm db:generate
pnpm --filter @compintel/db exec prisma migrate deploy
pnpm build
VITE_API_BASE_URL=/api pnpm --filter @compintel/web build

sudo systemctl restart compintel-api compintel-worker
```

重新加载 Caddy（或指向新的 `apps/web/dist`）后，再执行验收检查。go-judge 镜像使用固定 commit；只有在明确升级 Submodule、镜像标签和验证结果后才更新它。

## 10. 备份和安全边界

- PostgreSQL 是持久化数据源，源码和 replay 当前也保存在 PostgreSQL；必须纳入定期备份和恢复演练。
- Redis 只承载 BullMQ 队列和临时状态，不应当作为源码或评测结果的备份来源。
- 通过防火墙或私有网络限制 PostgreSQL、Redis、go-judge，仅允许 API/Worker 访问。
- 强制 HTTPS，保留 `NODE_ENV=production`，不要关闭 Cookie 的 `Secure` 属性。
- 源站仅接受 Cloudflare 回源，避免客户端直连伪造 `CF-Connecting-IP`（发信限流依赖该头）。
- 不要把 `.env`、数据库备份、用户源码或 go-judge 管理接口放入 Web 静态目录。
- go-judge 以特权容器运行，是不可信程序的隔离边界；应部署在专用主机或至少专用 Docker 节点，并限制主机上其他服务的权限。

## 11. 常见故障

| 现象                    | 优先检查                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| API 启动即退出          | `.env` 是否已加载；`DATABASE_URL`、`REDIS_URL` 是否为合法 URL。                            |
| 登录后 Cookie 不生效    | 是否通过 HTTPS 访问；API 是否设置 `NODE_ENV=production`；Caddy 是否转发 Host 和协议头。    |
| 提交一直停留在队列中    | `compintel-worker` 是否运行；Worker 与 API 是否使用同一个 `REDIS_URL`；查看 systemd 日志。 |
| 评测失败且提示 go-judge | 检查 `JUDGE_URL`、`/version`、Docker `privileged`、cgroup v2 和 go-judge 容器日志。        |
| 无法提交 Player         | 游戏是否已发布，以及是否存在启用的平台 C++ Player。                                        |
| 页面刷新后返回 404      | Caddy 是否配置 `try_files {path} /index.html`（或 Nginx 等价配置）。                       |
| 发信限流 IP 不准        | 流量是否经 Cloudflare；源站是否透传 `CF-Connecting-IP`；是否被直连绕过边缘。               |

查看应用日志：

```bash
journalctl -u compintel-api -o cat -f
journalctl -u compintel-worker -o cat -f
docker compose -f infra/compose.yaml logs -f go-judge
```

API 和 Worker 输出单行 JSON。可用响应头中的 `X-Request-Id` 定位 API 请求，或用评测详情中的 Evaluation ID 定位 Worker 流程：

```bash
journalctl -u compintel-api -o cat | jq 'select(.requestId == "<request-id>")'
journalctl -u compintel-worker -o cat | jq 'select(.evaluationId == "<evaluation-id>")'
```

日志字段、事件和敏感信息边界详见 `docs/tech/backend/logging.md`。
