# 缓存策略深度解析

## 1. 缓存核心问题

```
命中率（Hit Rate） = 缓存命中次数 / 总请求次数
延迟（Latency）    = 缓存未命中时的回退代价

核心决策:
  缓存什么？（热数据、重计算结果）
  缓存多久？（TTL）
  容量多大？（淘汰策略）
  一致性？  （失效策略）
```

---

## 2. 缓存模式

### Cache-Aside（旁路缓存，最常用）

```javascript
async function getUser(id) {
  // 1. 查缓存
  const cached = await redis.get(`user:${id}`);
  if (cached) return JSON.parse(cached);

  // 2. 缓存未命中，查数据库
  const user = await db.findById(id);
  if (!user) return null;

  // 3. 写入缓存（TTL 1小时）
  await redis.setex(`user:${id}`, 3600, JSON.stringify(user));
  return user;
}

// 更新时主动失效缓存
async function updateUser(id, data) {
  await db.update(id, data);
  await redis.del(`user:${id}`); // 删除缓存，下次走 DB
}
```

### Write-Through（写穿，保证一致性）

```javascript
async function updateUser(id, data) {
  // 同时更新缓存和数据库
  await Promise.all([
    db.update(id, data),
    redis.setex(`user:${id}`, 3600, JSON.stringify({ id, ...data })),
  ]);
}
```

---

## 3. 淘汰策略（Eviction Policies）

| 策略 | 全称 | 适用场景 |
|------|------|---------|
| LRU | Least Recently Used | 通用，访问频率均匀 |
| LFU | Least Frequently Used | 有热点数据的场景 |
| TTL | Time-To-Live | 有时效性的数据 |
| FIFO | First In First Out | 简单场景 |

---

## 4. LRU Cache 实现

```javascript
class LRUCache {
  constructor(capacity) {
    this.capacity = capacity;
    this.cache = new Map(); // 保持插入/访问顺序
  }

  get(key) {
    if (!this.cache.has(key)) return -1;
    // 移到末尾（最近使用）
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  put(key, value) {
    if (this.cache.has(key)) this.cache.delete(key);
    else if (this.cache.size >= this.capacity) {
      // 删除最久未使用（Map 迭代顺序 = 插入顺序）
      this.cache.delete(this.cache.keys().next().value);
    }
    this.cache.set(key, value);
  }
}
```

---

## 5. 缓存雪崩、穿透、击穿

```
缓存雪崩: 大量 key 同时过期 → 所有请求打到 DB
  防御: TTL 加随机抖动 (TTL + random(0, 300))

缓存穿透: 查询不存在的 key，每次都打到 DB
  防御: 缓存空值 (redis.set(key, 'NULL', 'EX', 60))
       或 Bloom Filter

缓存击穿: 热点 key 过期，大量并发请求同时重建
  防御: 互斥锁 (SET key:lock 1 NX EX 10)
       或永不过期 + 异步更新
```

---

## 6. 实践 Checklist

- [ ] 实现 LRU 缓存，验证正确性
- [ ] 在 Express 中加入 Redis cache-aside 中间件
- [ ] 为 TTL 加随机抖动，防止缓存雪崩
- [ ] 压测对比：有缓存 vs 无缓存的响应时间
