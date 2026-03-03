# MongoDB 与 Redis 深度解析

## Part 1: MongoDB

### 1. 聚合管道 (Aggregation Pipeline)

MongoDB 聚合管道由多个阶段（stages）组成，数据逐级传递：

```javascript
// 示例：统计每个作者的文章数、平均点赞数，只返回有"技术"标签的作者
db.posts.aggregate([
  // Stage 1: 过滤
  { $match: { tags: 'tech', published: true } },
  
  // Stage 2: 按 authorId 分组并统计
  { $group: {
    _id: '$authorId',
    postCount: { $sum: 1 },
    avgLikes: { $avg: '$likes' },
    totalViews: { $sum: '$views' },
    titles: { $push: '$title' },  // 收集数组
  }},
  
  // Stage 3: 关联 users 集合（类似 JOIN）
  { $lookup: {
    from: 'users',
    localField: '_id',
    foreignField: '_id',
    as: 'author',
  }},
  
  // Stage 4: 展开数组（lookup 返回数组）
  { $unwind: '$author' },
  
  // Stage 5: 重塑文档结构
  { $project: {
    _id: 0,
    authorName: '$author.name',
    postCount: 1,
    avgLikes: { $round: ['$avgLikes', 2] },
    totalViews: 1,
  }},
  
  // Stage 6: 排序
  { $sort: { postCount: -1 } },
  
  // Stage 7: 分页
  { $limit: 10 },
]);
```

### 常用聚合操作符
| 操作符 | 说明 | 示例 |
|--------|------|------|
| `$match` | 过滤（WHERE）| `{ $match: { status: 'active' } }` |
| `$group` | 分组（GROUP BY）| `{ $group: { _id: '$category', count: { $sum: 1 } } }` |
| `$sort` | 排序 | `{ $sort: { createdAt: -1 } }` |
| `$limit` | 限制数量 | `{ $limit: 10 }` |
| `$skip` | 跳过数量 | `{ $skip: 20 }` |
| `$lookup` | 关联查询（LEFT JOIN）| 见上面示例 |
| `$unwind` | 展开数组字段 | `{ $unwind: '$tags' }` |
| `$project` | 字段选择/计算 | `{ $project: { name: 1, _id: 0 } }` |
| `$addFields` | 添加新字段 | `{ $addFields: { fullName: { $concat: ['$first', ' ', '$last'] } } }` |
| `$facet` | 多管道并行（用于分页+统计）| |

### 2. 索引策略

```javascript
// 单字段索引
db.users.createIndex({ email: 1 }, { unique: true });

// 复合索引（注意字段顺序！ESR 原则）
// E = Equality（等值查询）先
// S = Sort（排序）次
// R = Range（范围查询）最后
db.posts.createIndex({ authorId: 1, published: 1, createdAt: -1 });

// 文本索引（全文搜索）
db.posts.createIndex({ title: 'text', content: 'text' });
db.posts.find({ $text: { $search: 'Node.js tutorial' } });

// 地理空间索引
db.stores.createIndex({ location: '2dsphere' });
db.stores.find({
  location: {
    $near: { $geometry: { type: 'Point', coordinates: [121.47, 31.23] }, $maxDistance: 1000 }
  }
});

// 部分索引（只索引满足条件的文档，节省空间）
db.orders.createIndex(
  { userId: 1, createdAt: -1 },
  { partialFilterExpression: { status: { $in: ['pending', 'processing'] } } }
);
```

### 3. 副本集 (Replica Set)

```
Primary ──写──→ Secondary 1
          ──写──→ Secondary 2
                  ↗ 自动故障切换
```

```javascript
// 读写关注点配置
const client = new MongoClient(uri, {
  readPreference: 'secondaryPreferred', // 读写分离：读取优先用从节点
  writeConcern: { w: 'majority', j: true, wtimeout: 5000 },
  readConcern: { level: 'majority' },   // 读取已提交到大多数节点的数据
});
```

---

## Part 2: Redis

### 4. Redis 数据结构

#### String（字符串）
```bash
SET key value EX 3600   # 设置值，过期时间 1 小时
GET key
INCR counter            # 原子递增（计数器）
MGET key1 key2 key3     # 批量获取
SETNX key value         # SET if Not eXists（分布式锁基础）
```

#### Hash（哈希）
```bash
HSET user:1 name "Alice" email "alice@example.com" age 30
HGET user:1 name        # "Alice"
HGETALL user:1          # { name: "Alice", email: ..., age: 30 }
HINCRBY user:1 age 1    # 原子递增某字段
HMSET user:1 ...        # 批量设置（Redis 4.0 后 HSET 支持多字段）
```

#### List（列表）—— 实现消息队列、时间线
```bash
LPUSH timeline:user:1 post_id_100  # 左边 push（最新的在前）
RPUSH queue:emails email_id_200    # 右边 push（FIFO 队列）
LRANGE timeline:user:1 0 -1       # 获取全部
LRANGE timeline:user:1 0 49       # 获取前 50 条
LTRIM timeline:user:1 0 999       # 只保留前 1000 条（防止无限增长）
LPOP queue:emails                  # 出队
BLPOP queue:emails 30              # 阻塞弹出（等待 30 秒）
```

#### Set（集合）—— 关注列表、去重
```bash
SADD followers:user:1 user:2 user:3 user:4
SMEMBERS followers:user:1
SCARD followers:user:1             # 集合大小
SISMEMBER followers:user:1 user:2  # 是否关注
SINTER set1 set2                   # 交集（共同关注）
SUNION set1 set2                   # 并集
SDIFF set1 set2                    # 差集
```

#### Sorted Set（有序集合）—— 排行榜、延迟队列
```bash
ZADD leaderboard 1500 "Alice"   # 添加分数
ZADD leaderboard 2300 "Bob"
ZRANGE leaderboard 0 -1 WITHSCORES REV  # 倒序（排行榜）
ZRANK leaderboard "Alice"        # 排名
ZINCRBY leaderboard 100 "Alice"  # 分数 +100
ZRANGEBYSCORE leaderboard 1000 2000  # 范围查询
```

#### Stream（流）—— 事件溯源、日志
```bash
XADD events * type "user.login" userId "123"  # 添加事件
XREAD COUNT 10 STREAMS events 0               # 读取事件
XGROUP CREATE events mygroup $ MKSTREAM       # 创建消费者组
XREADGROUP GROUP mygroup consumer1 COUNT 10 STREAMS events >  # 消费者读取
XACK events mygroup event-id                  # 确认处理完成
```

---

### 5. Redis 缓存模式

#### Cache-Aside（旁路缓存，最常用）
```javascript
async function getUser(userId) {
  const cacheKey = `user:${userId}`;
  
  // 1. 先查缓存
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);
  
  // 2. 缓存 miss → 查数据库
  const user = await db.users.findById(userId);
  if (!user) return null;
  
  // 3. 写入缓存（设置过期时间）
  await redis.setex(cacheKey, 3600, JSON.stringify(user));
  return user;
}

// 更新时使缓存失效
async function updateUser(userId, data) {
  await db.users.update(userId, data);
  await redis.del(`user:${userId}`); // 删除缓存，下次读时重新填充
}
```

#### 发布/订阅 (Pub/Sub)
```javascript
// npm install ioredis
const Redis = require('ioredis');
const pub = new Redis();
const sub = new Redis();

// 订阅
sub.subscribe('user-events', (err) => {
  console.log('Subscribed to user-events');
});
sub.on('message', (channel, message) => {
  const event = JSON.parse(message);
  console.log(`Event [${channel}]:`, event);
});

// 发布
await pub.publish('user-events', JSON.stringify({
  type: 'user.registered',
  userId: 123,
  email: 'alice@example.com',
}));
```

#### 分布式锁（SET NX EX）
```javascript
async function acquireLock(lockKey, lockValue, ttlSeconds = 30) {
  // SET key value NX EX ttl（原子操作：不存在才设置，同时设置过期时间）
  const result = await redis.set(lockKey, lockValue, 'NX', 'EX', ttlSeconds);
  return result === 'OK'; // 返回 null 则锁已存在
}

async function releaseLock(lockKey, lockValue) {
  // Lua 脚本确保原子性：只有持锁者才能释放
  const luaScript = `
    if redis.call("GET", KEYS[1]) == ARGV[1] then
      return redis.call("DEL", KEYS[1])
    else
      return 0
    end
  `;
  return redis.eval(luaScript, 1, lockKey, lockValue);
}

// 使用
const lockId = `lock:order:${orderId}`;
const lockToken = require('crypto').randomUUID();

const acquired = await acquireLock(lockId, lockToken, 30);
if (!acquired) throw new Error('Could not acquire lock');

try {
  await processOrder(orderId); // 临界区
} finally {
  await releaseLock(lockId, lockToken); // 确保释放
}
```

#### 滑动窗口限流
```javascript
async function isRateLimited(userId, limit = 100, windowSeconds = 60) {
  const key = `rate:${userId}:${Math.floor(Date.now() / 1000 / windowSeconds)}`;
  const current = await redis.incr(key);
  if (current === 1) await redis.expire(key, windowSeconds);
  return current > limit;
}
```

---

## 6. 练习 Checklist

- [ ] 用 MongoDB 聚合管道实现博客统计（作者文章数 + 平均点赞）
- [ ] 用 Redis Hash 缓存用户 session（ttl 设为 30 分钟）
- [ ] 用 Sorted Set 实现排行榜（前 10 名）
- [ ] 实现 Cache-Aside 模式（查询 + 缓存 + 失效）
- [ ] 用 SET NX EX 实现分布式锁，测试并发场景
