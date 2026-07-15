# 文档索引

当前文档覆盖已打通的五子棋 MVP：会话认证与用户审核、游戏目录、平台 C++ Player 管理、用户版本提交、多对手异步评测、加权分数和回放。项目支持手动部署，但暂未提供自动部署流水线；正式 Match 调度、排行榜、Rating 变更、对象存储和完整 Playwright E2E 不在当前实现范围内。

## 部署

- [手动部署指南](../DEPLOY.md)：生产主机准备、环境变量、基础设施、迁移、应用启动、Cloudflare + Caddy 反向代理、升级、备份和排障。

## API

- [身份验证与用户审核 API](api/authentication.md)：注册、登录、会话、退出及管理员审核接口。
- [游戏目录 API](api/games.md)：已发布游戏列表、游戏详情、管理员编辑/发布以及平台 C++ Player 管理接口。
- [Player 提交与评测 API](api/player-evaluations.md)：提交 Player/版本、按游戏分页查看公开记录，以及源码与平台对手评测详情。

## 后端技术

- [身份验证实现](tech/backend/authentication.md)：账号审核状态、密码摘要、服务端会话和授权边界。
- [游戏目录实现](tech/backend/game-catalog.md)：游戏元数据、草稿与发布边界及稳定 slug 约束。
- [Player 评测实现](tech/backend/player-evaluation.md)：数据模型、异步执行流程、沙箱边界与当前 MVP 限制。
- [内置 Player 实现](tech/backend/builtin-players.md)：平台 Player 的版本、注册、执行与升级约束。

## 前端技术

- [Web SPA](tech/web/frontend-framework.md)：身份认证、游戏目录、公开评测记录与详情、管理页面及前端开发约定。

## 游戏协议

- [五子棋交互协议 v1](tech/games/protocol/gomoku_v1.md)：初始化、逐回合输入输出、规则和资源限制。
