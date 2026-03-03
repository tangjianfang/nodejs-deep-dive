# 第六月分享：从 N+1 到 DataLoader — Node.js 数据库集成的陷阱与最佳实践

---

## Slide 1 — 封面

```
从 N+1 到 DataLoader
Node.js 数据库集成的陷阱与最佳实践

PostgreSQL + Prisma | MongoDB + Redis | BullMQ
```

🗣️ 大家好！今天我们聊 Node.js 中数据库那些坑，以及怎么填。
**互动：有没有在生产遇到过 N+1 问题导致接口慢？**

---

## Slide 2 — N+1 问题：最常见的性能杀手

```
❌ N+1 查询
  SELECT * FROM users             ← 1 次
  SELECT * FROM dept WHERE id=10  ← 每个用户 1 次
  SELECT * FROM dept WHERE id=10  ← ...
  SELECT * FROM dept WHERE id=10  ← N 次

5 个用户 → 6 次查询
500 个用户 → 501 次查询 ← 线性增长!

✅ 批量查询
  SELECT * FROM users
  SELECT * FROM dept WHERE id IN (10, 20)
  → 永远只有 2 次查询
```

🗣️ 演示 `demo-n-plus-one.js`，真实观察查询次数。

---

## Slide 3 — DataLoader：自动批处理 + 缓存

```
同一个 tick 内的多次 load():

  userLoader.load(1) ─┐
  userLoader.load(2) ─┤→ 批处理 → SELECT WHERE id IN (1,2,3)
  userLoader.load(3) ─┘

特性:
  ✅ 自动批处理（process.nextTick 调度）
  ✅ 请求级缓存（同一个 id 只查一次）
  ✅ 顺序保证（返回数组与 keys 顺序一致）
```

🗣️ DataLoader 是 Facebook 开源的，GraphQL 生态中普遍使用。

---

## Slide 4 — Prisma：类型安全的 ORM

```typescript
// schema.prisma
model User {
  id    Int    @id @default(autoincrement())
  email String @unique
  posts Post[]
}

// 代码中
const user = await prisma.user.findUnique({
  where: { id: 1 },
  include: { posts: true },  // JOIN，不是 N+1
});
```

🗣️ Prisma 的亮点是类型推导——返回类型自动包含 posts 字段。

---

## Slide 5 — 分布式锁：SET NX EX

```
❌ 没有锁
  Worker-A: 读库存=3
  Worker-B: 读库存=3    ← 同时！
  Worker-A: 写库存=2
  Worker-B: 写库存=2    ← 超卖！

✅ 分布式锁
  Worker-A: SET inventory:lock <uuid> NX EX 10  → OK
  Worker-B: SET inventory:lock <uuid> NX EX 10  → nil（等待重试）
  Worker-A: 读3→写2 → DEL lock（Lua 原子释放）
  Worker-B: 再次尝试 → OK
```

🗣️ 演示 `demo-redis-lock.js`，观察加锁前后库存是否正确。

---

## Slide 6 — BullMQ：可靠的任务队列

```
Producer → Redis → Worker
              ↓
         Job 生命周期:
         waiting → active → completed
                          → failed → (retry) → waiting
                          → delayed

关键特性:
  ✅ 原子性 job 状态转换（Lua 脚本）
  ✅ 自动重试 + 指数退避
  ✅ 并发控制（concurrency）
  ✅ 延迟任务 + cron 调度
  ✅ 优雅关机（等待 active job 完成）
```

🗣️ 演示 `demo-bullmq.js`，展示重试、并发、优雅关机。

---

## Slide 7 — 本月技术栈总结

| 场景 | 工具 | 核心价值 |
|------|------|---------|
| 关系数据 | PostgreSQL + Prisma | 类型安全、迁移管理 |
| 文档存储 | MongoDB + Mongoose | 灵活 Schema、聚合管道 |
| 缓存/锁 | Redis | 高性能、原子操作 |
| 消息队列 | BullMQ | 可靠、支持重试 |

🗣️ 这四个是 Node.js 后端最常见的数据层组合。

---

## Slide 8 — 下月预告：认证与安全

```
Month 07: 认证安全全景图
  JWT 深度解析（RS256 vs HS256）
  OAuth2 + PKCE 授权码流程
  加密原理（对称 vs 非对称）
  常见攻击防御（CSRF、XSS、SQL 注入）
```

🗣️ **提问：大家项目里用 JWT 还是 Session？有没有遇到 token 被盗用的情况？**
