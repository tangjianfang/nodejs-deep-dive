/**
 * demo-lru-cache.js
 * LRU Cache 原理与实现 + 缓存策略演示
 */

'use strict';

// ─── LRU Cache 实现（O(1) get/put）────────────────────────────────────────────

class LRUCache {
  constructor(capacity) {
    this.capacity = capacity;
    this._cache = new Map(); // Map 保持插入顺序，newest at end
    this._hits = 0;
    this._misses = 0;
  }

  get(key) {
    if (!this._cache.has(key)) {
      this._misses++;
      return undefined;
    }
    // 移到末尾（标记为最近使用）
    const value = this._cache.get(key);
    this._cache.delete(key);
    this._cache.set(key, value);
    this._hits++;
    return value;
  }

  set(key, value) {
    if (this._cache.has(key)) {
      this._cache.delete(key);
    } else if (this._cache.size >= this.capacity) {
      // 删除最久未使用（Map 的第一个 key）
      const lruKey = this._cache.keys().next().value;
      this._cache.delete(lruKey);
    }
    this._cache.set(key, value);
  }

  get size() { return this._cache.size; }
  get hitRate() {
    const total = this._hits + this._misses;
    return total === 0 ? 0 : (this._hits / total * 100).toFixed(1) + '%';
  }

  stats() {
    return { size: this.size, capacity: this.capacity, hits: this._hits, misses: this._misses, hitRate: this.hitRate };
  }
}

// ─── TTL Cache（带过期时间）────────────────────────────────────────────────────

class TTLCache {
  constructor(defaultTTL = 60000) {
    this._store = new Map(); // key → { value, expiresAt }
    this._defaultTTL = defaultTTL;
  }

  set(key, value, ttl = this._defaultTTL) {
    const expiresAt = Date.now() + ttl;
    this._store.set(key, { value, expiresAt });
  }

  get(key) {
    const entry = this._store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this._store.delete(key); // 惰性删除
      return undefined;
    }
    return entry.value;
  }

  // 防缓存雪崩：TTL 加随机抖动
  setWithJitter(key, value, baseTTL, jitter = 0.2) {
    const jitterMs = baseTTL * jitter * Math.random();
    this.set(key, value, baseTTL + jitterMs);
  }
}

// ─── Async Cache（异步加载 + 防缓存击穿）──────────────────────────────────────

class AsyncCache {
  constructor(loader, options = {}) {
    this._loader  = loader;
    this._lru     = new LRUCache(options.capacity || 1000);
    this._ttl     = options.ttl || 60000;
    this._loading = new Map(); // 防止重复加载（多个请求等待同一个 key）
  }

  async get(key) {
    // 1. LRU 缓存命中
    const cached = this._lru.get(key);
    if (cached !== undefined) return cached;

    // 2. 正在加载（防击穿: 多个并发请求共享同一个 Promise）
    if (this._loading.has(key)) {
      return this._loading.get(key);
    }

    // 3. 加载数据
    const loadPromise = this._loader(key).then(value => {
      this._lru.set(key, value);
      this._loading.delete(key);
      return value;
    }).catch(err => {
      this._loading.delete(key);
      throw err;
    });

    this._loading.set(key, loadPromise);
    return loadPromise;
  }
}

// ─── 演示 ──────────────────────────────────────────────────────────────────────

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('=== Demo 1：LRU Cache 基本操作 ===\n');

  const lru = new LRUCache(3);
  lru.set('a', 1); lru.set('b', 2); lru.set('c', 3);
  console.log('cache: [a,b,c]，大小:', lru.size);

  console.log('get(a):', lru.get('a')); // 访问 a，a 变为最近

  lru.set('d', 4); // 容量已满，淘汰最久未使用的 b
  console.log('set(d)，淘汰最旧的 b');
  console.log('get(b):', lru.get('b')); // undefined（已被淘汰）
  console.log('get(c):', lru.get('c')); // 3
  console.log('get(d):', lru.get('d')); // 4
  console.log('Stats:', lru.stats());

  console.log('\n=== Demo 2：TTL Cache（防雪崩）===\n');

  const ttl = new TTLCache(200); // 200ms TTL
  ttl.set('user:1', { name: 'Alice' });
  console.log('立即读取:', ttl.get('user:1')?.name);
  await sleep(250);
  console.log('250ms 后读取:', ttl.get('user:1')); // undefined（已过期）

  // 防雪崩：同一 key 的 TTL 加随机抖动
  const cache2 = new TTLCache(1000);
  for (let i = 0; i < 5; i++) {
    cache2.setWithJitter(`item:${i}`, i, 1000, 0.3);
  }
  console.log('不同 key 过期时间不同（防雪崩）：', [...Array(5).keys()].map(i => {
    const entry = cache2._store.get(`item:${i}`);
    return `item:${i} → ${(entry.expiresAt - Date.now()).toFixed(0)}ms`;
  }).join(', '));

  console.log('\n=== Demo 3：AsyncCache（防击穿）===\n');

  let dbCallCount = 0;
  const asyncCache = new AsyncCache(async (key) => {
    dbCallCount++;
    console.log(`  [DB] 查询 ${key}（第 ${dbCallCount} 次 DB 调用）`);
    await sleep(100); // 模拟 DB 延迟
    return { id: key, data: `data for ${key}` };
  }, { capacity: 100, ttl: 60000 });

  // 同时发起 5 个对同一 key 的请求
  console.log('5 个并发请求 key="user:1"...');
  const results = await Promise.all(
    Array.from({ length: 5 }, () => asyncCache.get('user:1'))
  );
  console.log(`✅ DB 只被调用 ${dbCallCount} 次（防止缓存击穿）`);
  console.log(`所有请求得到相同结果: ${results.every(r => r.id === 'user:1')}`);

  // 第二次请求（命中缓存）
  dbCallCount = 0;
  await asyncCache.get('user:1');
  console.log(`第二次请求 DB 调用次数: ${dbCallCount} (命中缓存)`);
  console.log('LRU 命中率:', asyncCache._lru.hitRate);
}

main().catch(console.error);
