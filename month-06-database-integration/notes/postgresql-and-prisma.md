# PostgreSQL 与 Prisma ORM 深度解析

## 1. Prisma 核心概念

Prisma 是 TypeScript-first 的 ORM，由三部分组成：
- **Prisma Client**：类型安全的查询构建器（自动生成）
- **Prisma Migrate**：数据库迁移工具
- **Prisma Studio**：可视化数据库管理界面

```bash
npm install prisma @prisma/client
npx prisma init
```

---

## 2. Schema 定义

```prisma
// prisma/schema.prisma

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  posts     Post[]
  profile   Profile?
  
  @@index([email])    // 索引
  @@map("users")      // 映射到实际表名
}

model Post {
  id        Int      @id @default(autoincrement())
  title     String
  content   String?
  published Boolean  @default(false)
  author    User     @relation(fields: [authorId], references: [id], onDelete: Cascade)
  authorId  Int
  tags      Tag[]    @relation("PostToTag") // 多对多
  createdAt DateTime @default(now())
  
  @@index([authorId, createdAt])
}

model Tag {
  id    Int    @id @default(autoincrement())
  name  String @unique
  posts Post[] @relation("PostToTag")
}

model Profile {
  id     Int    @id @default(autoincrement())
  bio    String?
  user   User   @relation(fields: [userId], references: [id])
  userId Int    @unique
}
```

---

## 3. 迁移管理

```bash
# 开发环境迁移（生成 SQL 文件 + 执行）
npx prisma migrate dev --name add_user_table

# 生产环境迁移（只执行，不生成新迁移）
npx prisma migrate deploy

# 查看迁移状态
npx prisma migrate status

# 重置数据库（危险！仅开发）
npx prisma migrate reset
```

生成的迁移文件（`prisma/migrations/20260303_add_user_table/migration.sql`）：
```sql
CREATE TABLE "users" (
  "id" SERIAL PRIMARY KEY,
  "email" TEXT UNIQUE NOT NULL,
  "name" TEXT,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP
);
CREATE INDEX ON "users"("email");
```

---

## 4. Prisma Client 查询

### 基础 CRUD
```typescript
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Create
const user = await prisma.user.create({
  data: { email: 'alice@example.com', name: 'Alice' },
});

// Read（多种过滤器）
const users = await prisma.user.findMany({
  where: {
    email: { endsWith: '@example.com' },
    createdAt: { gte: new Date('2026-01-01') },
    posts: { some: { published: true } }, // 过滤有已发布文章的用户
  },
  select: { id: true, name: true, email: true }, // 只查需要的字段
  orderBy: { createdAt: 'desc' },
  skip: 0,
  take: 10,
});

// Update
const updated = await prisma.user.update({
  where: { id: 1 },
  data: { name: 'Alice Updated' },
});

// Upsert
const upserted = await prisma.user.upsert({
  where: { email: 'alice@example.com' },
  update: { name: 'Alice Updated' },
  create: { email: 'alice@example.com', name: 'Alice' },
});

// Delete
await prisma.user.delete({ where: { id: 1 } });
```

### 关联查询（解决 N+1）
```typescript
// ❌ N+1 问题
const users = await prisma.user.findMany();
for (const user of users) {
  const posts = await prisma.post.findMany({ where: { authorId: user.id } }); // N次查询！
}

// ✅ 使用 include（JOIN 查询）
const usersWithPosts = await prisma.user.findMany({
  include: {
    posts: {
      where: { published: true },
      select: { id: true, title: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    },
    profile: true,
  },
});
// SQL: SELECT users.*, posts.* FROM users LEFT JOIN posts ON posts.author_id = users.id ...
```

---

## 5. 事务

```typescript
// 方式1: 顺序事务（$transaction 数组）
const [createdUser, createdPost] = await prisma.$transaction([
  prisma.user.create({ data: { email: 'bob@example.com' } }),
  prisma.post.create({ data: { title: 'Hello World', authorId: 1 } }),
]);

// 方式2: 交互式事务（更灵活，支持条件逻辑）
const result = await prisma.$transaction(async (tx) => {
  const user = await tx.user.findUnique({ where: { id: 1 } });
  if (!user) throw new Error('User not found');
  
  const post = await tx.post.create({
    data: { title: 'New Post', authorId: user.id },
  });
  
  await tx.user.update({
    where: { id: user.id },
    data: { updatedAt: new Date() },
  });
  
  return { user, post };
});
// 如果事务中任何操作失败，自动 ROLLBACK
```

---

## 6. 原始 SQL 查询

```typescript
// 当 ORM 不够用时，使用原始 SQL
const users = await prisma.$queryRaw<User[]>`
  SELECT id, name, email,
    (SELECT COUNT(*) FROM posts WHERE author_id = users.id) as post_count
  FROM users
  WHERE created_at > ${new Date('2026-01-01')}
  ORDER BY post_count DESC
  LIMIT ${10}
`;

// 原始 SQL 更新
await prisma.$executeRaw`
  UPDATE users SET updated_at = NOW() WHERE id = ${userId}
`;

// ⚠️ 使用 Prisma.sql 标签防止 SQL 注入
import { Prisma } from '@prisma/client';
const email = Prisma.sql`${userInput}`; // 自动参数化
```

---

## 7. 连接池配置

```typescript
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: `${process.env.DATABASE_URL}?connection_limit=10&pool_timeout=30`,
    }
  },
  log: ['query', 'info', 'warn', 'error'], // 开发时记录所有 SQL
});

// 连接池参数
// connection_limit: 最大连接数（默认：cpu 核数 * 2 + 1）
// pool_timeout: 等待连接超时（秒）
// connect_timeout: 建立连接超时（秒）

// Prisma Data Platform 或 PgBouncer: 用于 Serverless 场景（每次请求不重用连接）
// DATABASE_URL=postgresql://...?pgbouncer=true&connection_limit=1
```

---

## 8. EXPLAIN ANALYZE 查询分析

```sql
-- 分析慢查询
EXPLAIN ANALYZE
SELECT u.name, COUNT(p.id) as post_count
FROM users u
LEFT JOIN posts p ON p.author_id = u.id
WHERE u.created_at > '2026-01-01'
GROUP BY u.id, u.name
ORDER BY post_count DESC
LIMIT 10;

/* 输出示例:
Limit (cost=42.50..42.53 rows=10 width=40) (actual time=1.234..1.236 rows=10 loops=1)
  Sort (cost=42.50..42.53 ...)
    -> HashAggregate (...)
      -> Hash Left Join (...)
          Hash Cond: (p.author_id = u.id)
          -> Seq Scan on posts  ← ⚠️ 全表扫描！需要添加索引
          -> Hash
               -> Index Scan on users ...
Planning Time: 0.345 ms
Execution Time: 1.567 ms
*/

-- 添加缺失的索引
CREATE INDEX CONCURRENTLY idx_posts_author_id ON posts(author_id);
-- CONCURRENTLY: 不锁表，生产环境必用
```

---

## 9. 练习 Checklist

- [ ] 配置 Prisma schema，定义 User/Post/Tag 模型
- [ ] 编写一个包含 N+1 问题的查询，然后用 `include` 修复
- [ ] 实现一个使用交互式事务的转账功能（两账户余额更新）
- [ ] 使用 `EXPLAIN ANALYZE` 分析一个慢查询，添加索引后对比
- [ ] 配置 Prisma 的查询日志，观察实际执行的 SQL
