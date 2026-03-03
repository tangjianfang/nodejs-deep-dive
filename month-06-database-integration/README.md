# Month 06 — 数据库集成

## 学习目标

掌握 Node.js 与主流数据库的集成模式，理解 N+1 问题、连接池、分布式锁等关键概念。

---

## 进度追踪

| # | 任务 | 类型 | 状态 | 完成日期 |
|---|------|------|------|---------|
| 1 | 阅读 postgresql-and-prisma.md | 笔记 | ⬜ | |
| 2 | 阅读 mongodb-and-redis.md | 笔记 | ⬜ | |
| 3 | 阅读 bullmq-and-queues.md | 笔记 | ⬜ | |
| 4 | 运行 demo-n-plus-one.js | 实践 | ⬜ | |
| 5 | 运行 demo-redis-lock.js | 实践 | ⬜ | |
| 6 | 运行 demo-bullmq.js | 实践 | ⬜ | |
| 7 | 完成月度分享 slides.md | 输出 | ⬜ | |

---

## 核心概念速览

```
N+1 Problem:
  SELECT * FROM posts;                    // 1次查询
  for post in posts:
    SELECT * FROM users WHERE id = ?      // N次查询！

DataLoader 解法:
  收集所有 user_id → 一次 WHERE id IN (1,2,3...)
```

## 参考资料

- [Prisma 文档](https://www.prisma.io/docs)
- [MongoDB Aggregation Pipeline](https://www.mongodb.com/docs/manual/aggregation/)
- [Redis 命令参考](https://redis.io/commands/)
- [BullMQ 文档](https://docs.bullmq.io/)
