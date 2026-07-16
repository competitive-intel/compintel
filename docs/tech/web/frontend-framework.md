# Web 前端框架

`apps/web` 是 CompIntel 的 React 单页应用，使用 Vite、TypeScript、shadcn/ui 组件组织方式和 Tailwind CSS v4 构建。当前包含身份验证、邮箱验证、游戏目录与详情、通用程序提交、公开评测记录与详情、游戏管理、用户管理和系统设置页面。

## 本地运行

本地开发应同时启动 API、Worker 和前端：

```bash
pnpm start
```

需要分别调试时，在三个终端运行：

```bash
pnpm --filter @compintel/api dev
pnpm --filter @compintel/worker dev
pnpm --filter @compintel/web dev
```

默认访问地址是 `http://localhost:5173`。开发服务器将 `/api/*` 请求代理到 `http://localhost:3000/*`，浏览器不需要直接处理跨域配置。Worker 是提交评测的队列消费者，不能只启动 API 和 Web。

## 目录结构

```text
apps/web/
├── src/
│   ├── components/     # 跨页面 UI 组件和全局布局
│   │   └── ui/          # 仓库内维护的 shadcn/ui 基础组件
│   ├── games/          # 按游戏拆分的回放 UI、测试与 fixture
│   ├── lib/            # API 客户端、认证与主题状态
│   ├── pages/          # 按功能域组织的路由页面
│   │   ├── admin/      # 游戏管理、用户管理与系统设置
│   │   ├── auth/       # 登录、注册与邮箱验证
│   │   ├── games/      # 游戏目录与详情
│   │   └── submissions/ # 评测记录与详情
│   ├── test/           # 测试环境初始化
│   ├── App.tsx         # 顶层路由表
│   ├── main.tsx        # React、Router 和 Query Provider 入口
│   └── styles.css      # 当前全局视觉样式
├── index.html
├── tsconfig.json
└── vite.config.ts
```

## 页面与数据请求

当前页面为：

- `/login`、`/register`、`/verify-email`：登录、注册与邮箱验证。注册与重发验证码在触发 per-IP 限流后会拉取 `GET /v1/auth/captcha-config` 并展示 Cloudflare Turnstile（`TurnstileWidget`）。验证成功后跳转登录页。
- `/`：登录后重定向到 `/games`。
- `/games`：读取已发布游戏，并以纵向列表显示平台游戏目录。
- `/games/:gameSlug`：以 Badge 显示每步 CPU、整局 CPU 与内存限制，以扁平排版显示合并后的规则与通信协议 Markdown，并在同一页通过 Monaco Editor 提交 C++ 程序。Player 名称使用 shadcn Combobox 自动补全当前用户在该游戏中用过的名称；选择已有名称会由 API 创建下一版本，输入新名称则创建版本 1。提交成功后直接跳转到该版本的评测详情页，不在当前页停留显示成功提示。详情页不单独展示“游戏介绍”区块；Markdown 和提交表单不额外使用 Card 包裹，页面不包含任何写死的具体游戏规则或代码模板。每个游戏在 24 小时滑动窗口内最多提交 50 次。
- `/games/:gameSlug/submissions`：分页显示游戏下的全部公开提交版本、聚合评测进度、击败对手数量和最终整数分数；存在未完成任务时每 5 秒刷新。
- `/submissions/:submissionId`：显示不可变版本的公开源码、作者、最终分数、各平台对手权重、是否击败、verdict、资源摘要、日志和已有回放；源码使用 Shiki 静态高亮展示，不额外套 Card。每个对手的评测结果默认展开并可独立折叠；五子棋与路墙棋回放按 `gameSlug` 选择棋盘，初始显示终局，支持回到开局、逐步前后移动、跳到终局和自动播放。路墙棋回放同时重建双方棋子和横竖墙，红方表示先手、蓝方表示后手，墙体颜色跟随放置方；终局帧以模糊蒙版标明红方或蓝方获胜，查看历史步骤时隐藏蒙版。评测完成前每 3 秒刷新。
- `/admin/games`：管理员编辑源代码中已安装的游戏目录、CPU 与内存限制、发布状态，并添加、停用、调整评分权重或创建内置 C++ 程序的新版本。资源限制使用 InputGroup 在输入框尾部显示单位；页面不提供新增游戏入口。
- `/admin/users`：管理员查看所有用户的用户名、显示名、邮箱与总提交次数，并可封禁或解封普通用户。
- `/admin/settings`：管理员配置腾讯云 SES 发件地址、`tencentSesTemplateId`（模板 ID）、允许的邮箱提供商域名（完整注册域），以及 Cloudflare Turnstile Site Key；Turnstile Secret Key 可由管理员编辑，但读取或展示时永不回显。腾讯云 SES API 凭证（`TENCENT_SES_SECRET_ID` / `TENCENT_SES_SECRET_KEY`）仅通过环境变量配置，页面不提供编辑表单；未配置时以红色警告提示无法发信，已配置时不展示 SES 凭证相关提示。

管理员登录后，应用外壳每 10 秒读取 `GET /v1/admin/evaluation-worker-status`。没有 Worker 消费者时在导航栏下方显示告警，恢复后自动隐藏；状态接口失败时显示无法确认状态的独立告警。普通用户不请求该接口，也不显示运维状态。

业务路由由 `ProtectedRoute` 统一检查登录状态，管理员路由再检查角色。API 请求统一通过 Axios 实例发送，并设置 `withCredentials: true` 携带 HttpOnly 会话 Cookie；浏览器代码不读取或保存会话令牌。TanStack Query 的 AbortSignal 会传入 Axios，页面卸载或查询失效时可取消请求。

所有路由页面通过统一的 `usePageTitle` hook 设置浏览器标题，格式为“页面名 | CompIntel”；游戏与提交详情在数据加载完成后使用对应的游戏名或程序名。游戏目录中的名称、摘要和状态整体可点击进入详情，右侧仍保留独立的“查看游戏”入口。

登录后的业务页面统一使用 `PageTitle` 渲染一级标题，字号为移动端 `text-2xl`、`sm` 及以上 `text-3xl`。页面不得自行覆盖一级标题字号；认证页面使用 Card 标题，不混入业务页的 `h1` 层级。

TanStack Query 在 `main.tsx` 中统一配置。`src/lib/api.ts` 封装 Axios 请求和统一错误转换，并使用 `packages/contracts` 导出的 Zod Schema 校验身份、游戏目录、内置程序管理、提交、评测记录和详情响应，避免未经验证的数据进入组件。

游戏专属前端实现统一放在 `src/games/`，每个游戏使用独立文件维护回放 UI，并由 `src/games/index.tsx` 集中分派。通用页面和 `components/` 不直接判断具体游戏；新增游戏时同步增加对应实现、测试 fixture 和 registry 项。

游戏详情的 `rulesMarkdown` 由 `MarkdownContent` 使用 `markdown-it` 渲染。解析器关闭原始 HTML，启用链接识别，并通过 `@mdit/plugin-katex` 支持 `$...$`、`$$...$$`、`\\(...\\)` 和 `\\[...\\]` 公式；fenced C++ 代码块由 Shiki 静态高亮。KaTeX 样式、字体和代码主题由前端构建产物一并提供。

C++ 源码输入统一使用 Monaco Editor，编辑器核心按需加载；`@shikijs/monaco` 将 Shiki 的 C++ TextMate grammar 和 GitHub Light/Dark 主题注入 Monaco，保证编辑态与只读态使用同一套高亮规则。公开源码使用 Shiki 在浏览器中生成静态 HTML；两种展示都跟随全局浅色/暗色主题切换。单元测试环境使用语义等价的 `Textarea` 适配器，因为 jsdom 不提供 Monaco 所需的浏览器 Worker 和布局能力。

## Tailwind CSS

项目采用 Tailwind CSS v4 的 Vite 插件。`vite.config.ts` 注册 `@tailwindcss/vite`，`src/styles.css` 通过 `@import "tailwindcss"` 引入框架，并使用 shadcn/ui 语义 token 维护背景、前景、边框、表单和状态颜色。界面默认使用白色背景、近黑正文和灰阶层次，不在业务页面中维护浅色、暗色两套原始颜色。

`src/lib/theme.tsx` 提供全局浅色/暗色主题状态。默认主题为浅色，用户切换后将偏好保存到浏览器 `localStorage`，暗色模式通过根元素的 `.dark` 类和同一组语义 token 生效。认证布局和登录后的应用布局均提供主题切换入口。

认证布局和登录后的应用布局共用 `AppFooter`：页脚依次展示项目名、构建对应的 Git commit 短 ID 和“开源”入口；commit ID 链接到 GitHub 上的对应提交，“开源”链接到项目仓库。`vite.config.ts` 在构建时使用 `simple-git` 读取当前仓库的 `HEAD`；构建环境不含 Git 元数据时依次回退到 `COMPINTEL_GIT_COMMIT`、`GITHUB_SHA`、`CI_COMMIT_SHA`，仍不可用时显示 `unknown`。这三个环境变量均在 `turbo.json` 的 `@compintel/web#build.env` 中声明，以便在 Strict Mode 下传入 Web 构建，并参与其 Turbo 缓存键计算。

`components.json` 固定 shadcn/ui 的 `new-york`、Radix 和 Lucide 配置。`components/ui` 按“组件源码归属应用”方式维护 Button、Input、InputGroup、Textarea、Field、Switch、Card、Collapsible、Badge、Alert、Empty、Skeleton、Separator、Table、Breadcrumb、Dropdown Menu 和 Tooltip 等基础组件。游戏详情与评测页面使用 Breadcrumb 表达页面层级，不再保留重复的返回入口。业务页面优先组合这些原生组件，并分别呈现加载、空数据、错误、进行中和成功状态。

生产环境默认请求同源的 `/api` 前缀（与 [DEPLOY.md](../../../DEPLOY.md) 中 Cloudflare → Caddy 将 `/api` 反代到 API 的约定一致）；如果部署拓扑不同，可以在构建时设置公开变量：

```bash
VITE_API_BASE_URL=https://example.com/api pnpm --filter @compintel/web build
```

所有 `VITE_` 变量都会进入浏览器产物，禁止写入密码、Token 或内部服务地址。

## 质量检查

```bash
pnpm --filter @compintel/web typecheck
pnpm --filter @compintel/web test
pnpm --filter @compintel/web build
```

组件测试使用 Vitest、jsdom 和 React Testing Library。测试文件与所属页面或组件放在同一目录，不使用单个顶层测试文件集中覆盖所有功能；`src/test/fixtures.ts` 提供符合 contracts 类型的共享数据，`src/test/render.tsx` 统一提供 TanStack Query 和测试所需的 Router 上下文。

当前单元测试聚焦纯前端渲染与组件交互，包括加载、空数据、错误、成功、进行中等状态，表单反馈，评测 verdict 与资源格式化，棋盘回放，以及管理员编辑状态。顶层路由编排、路由守卫和页面跳转不在该单元测试范围内。

仓库尚未建立覆盖注册、邮箱验证、平台 Player 配置、提交和真实沙箱评测全链路的完整 Playwright E2E。
