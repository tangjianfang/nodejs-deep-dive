# Month 11 — DevOps 与部署

## 学习目标

掌握 Docker 多阶段构建、Kubernetes 基础、GitHub Actions CI/CD、优雅关机。

---

## 进度追踪

| # | 任务 | 类型 | 状态 | 完成日期 |
|---|------|------|------|---------|
| 1 | 阅读 docker-and-containers.md | 笔记 | ⬜ | |
| 2 | 阅读 kubernetes-basics.md | 笔记 | ⬜ | |
| 3 | 阅读 ci-cd-pipeline.md | 笔记 | ⬜ | |
| 4 | 运行 demo-graceful-shutdown.js | 实践 | ⬜ | |
| 5 | 运行 demo-health-check.js | 实践 | ⬜ | |
| 6 | 阅读 scripts/Dockerfile | 实践 | ⬜ | |
| 7 | 完成月度分享 slides.md | 输出 | ⬜ | |

---

## 核心概念速览

```
Docker 多阶段构建:
  FROM node:20 AS builder → npm ci --include=dev → npm run build
  FROM node:20-alpine AS runner → COPY --from=builder /dist → CMD

优雅关机流程:
  SIGTERM → 停止接受新连接 → 等待进行中请求完成 → 关闭 DB 连接 → exit(0)
```

## 参考资料

- [Docker 最佳实践](https://docs.docker.com/develop/develop-images/dockerfile_best-practices/)
- [Kubernetes 文档](https://kubernetes.io/docs/home/)
- [GitHub Actions 文档](https://docs.github.com/en/actions)
