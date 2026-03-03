# Month 12 — Capstone 结业项目

## 项目简介

设计并实现一个 **"Twitter-like 时间线服务"**，综合运用前 11 个月学到的所有技术。

## 架构概览

```
客户端
  │
  ▼
API Gateway (限流 + 路由 + JWT 认证)
  │
  ├──▶ TimelineService (Node.js + Koa)
  │         ├─ Redis List（热数据：时间线缓存）
  │         └─ PostgreSQL（冷数据：全量帖子）
  │
  ├──▶ PostService (NestJS)
  │         ├─ PostgreSQL (帖子存储)
  │         └─ BullMQ (异步 fan-out)
  │
  └──▶ UserService (NestJS)
            └─ PostgreSQL (用户数据)
```

---

## 进度追踪

| # | 任务 | 类型 | 状态 | 完成日期 |
|---|------|------|------|---------|
| 1 | 阅读 system-design.md | 笔记 | ⬜ | |
| 2 | 阅读 architecture-decisions.md | 笔记 | ⬜ | |
| 3 | 阅读 project-checklist.md | 笔记 | ⬜ | |
| 4 | 运行 demo-system-design.js | 实践 | ⬜ | |
| 5 | 运行 demo-rate-limiter.js | 实践 | ⬜ | |
| 6 | 运行 demo-api-gateway.js | 实践 | ⬜ | |
| 7 | 完成结业分享 slides.md | 输出 | ⬜ | |

---

## 容量估算

```
用户数: 10M DAU
每用户每天发帖: 1次 → 10M 帖子/天 → 115 TPS (写)
每用户读时间线: 20次 → 2000 TPS (读)
关注者平均数: 300人 → fan-out 3B次/天 (Redis 写)
```

## 技术栈

| 层 | 技术 |
|---|------|
| API | NestJS + Koa |
| 数据库 | PostgreSQL + Prisma |
| 缓存 | Redis 6.x |
| 队列 | BullMQ |
| 容器 | Docker + K8s |
| CI/CD | GitHub Actions |
| 监控 | Prometheus + Grafana |
