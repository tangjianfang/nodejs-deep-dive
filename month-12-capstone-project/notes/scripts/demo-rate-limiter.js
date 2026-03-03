/**
 * demo-rate-limiter.js
 * 三种限流算法实现：固定窗口、滑动窗口、令牌桶
 * run: node demo-rate-limiter.js
 */

'use strict';

// ─── 1. 固定窗口（Fixed Window）───────────────────────────────────────────────
// 缺点：窗口边界突刺问题（两个窗口交界处可能放行 2x 流量）

class FixedWindowRateLimiter {
  constructor({ limit, windowMs }) {
    this.limit = limit;        // 窗口内最大请求数
    this.windowMs = windowMs;  // 窗口大小（ms）
    this._windows = new Map(); // key → { count, resetAt }
  }

  allow(key) {
    const now = Date.now();
    const windowStart = Math.floor(now / this.windowMs) * this.windowMs;
    const resetAt = windowStart + this.windowMs;

    const entry = this._windows.get(key);
    if (!entry || entry.resetAt <= now) {
      this._windows.set(key, { count: 1, resetAt });
      return { allowed: true, remaining: this.limit - 1, resetAt };
    }

    if (entry.count >= this.limit) {
      return { allowed: false, remaining: 0, resetAt: entry.resetAt, retryAfter: entry.resetAt - now };
    }

    entry.count++;
    return { allowed: true, remaining: this.limit - entry.count, resetAt: entry.resetAt };
  }
}

// ─── 2. 滑动窗口日志（Sliding Window Log）────────────────────────────────────
// 精确但内存开销高，每次请求都记录时间戳

class SlidingWindowLogLimiter {
  constructor({ limit, windowMs }) {
    this.limit = limit;
    this.windowMs = windowMs;
    this._logs = new Map(); // key → [timestamp, ...]
  }

  allow(key) {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    if (!this._logs.has(key)) this._logs.set(key, []);
    const log = this._logs.get(key);

    // 清除窗口外的旧记录
    const validLog = log.filter(ts => ts > windowStart);
    this._logs.set(key, validLog);

    if (validLog.length >= this.limit) {
      const oldestInWindow = validLog[0];
      return {
        allowed: false,
        remaining: 0,
        retryAfter: oldestInWindow + this.windowMs - now,
      };
    }

    validLog.push(now);
    return { allowed: true, remaining: this.limit - validLog.length };
  }
}

// ─── 3. 滑动窗口计数（Sliding Window Counter）────────────────────────────────
// 固定窗口 + 加权计算，近似滑动窗口，内存友好

class SlidingWindowCounterLimiter {
  constructor({ limit, windowMs }) {
    this.limit = limit;
    this.windowMs = windowMs;
    this._windows = new Map(); // key → { current: count, previous: count, windowStart }
  }

  allow(key) {
    const now = Date.now();
    const currentWindowStart = Math.floor(now / this.windowMs) * this.windowMs;
    const elapsed = now - currentWindowStart;
    const previousWeight = 1 - (elapsed / this.windowMs); // 上个窗口的权重

    let entry = this._windows.get(key);

    if (!entry || entry.windowStart !== currentWindowStart) {
      const previousCount = entry ? entry.current : 0;
      entry = { current: 0, previous: previousCount, windowStart: currentWindowStart };
      this._windows.set(key, entry);
    }

    // 加权估算：当前窗口已有请求 + 上个窗口权重
    const estimatedCount = entry.current + Math.floor(entry.previous * previousWeight);

    if (estimatedCount >= this.limit) {
      return { allowed: false, remaining: 0, estimated: estimatedCount };
    }

    entry.current++;
    return { allowed: true, remaining: this.limit - estimatedCount - 1, estimated: estimatedCount + 1 };
  }
}

// ─── 4. 令牌桶（Token Bucket）────────────────────────────────────────────────
// 允许突发流量，但长期速率不超过 refillRate

class TokenBucketLimiter {
  constructor({ capacity, refillRate, refillIntervalMs = 1000 }) {
    this.capacity = capacity;          // 桶的最大容量
    this.refillRate = refillRate;      // 每个 interval 补充的令牌数
    this.refillIntervalMs = refillIntervalMs;
    this._buckets = new Map();         // key → { tokens, lastRefill }
  }

  _getBucket(key) {
    if (!this._buckets.has(key)) {
      this._buckets.set(key, { tokens: this.capacity, lastRefill: Date.now() });
    }
    return this._buckets.get(key);
  }

  _refill(bucket) {
    const now = Date.now();
    const elapsed = now - bucket.lastRefill;
    const tokensToAdd = Math.floor(elapsed / this.refillIntervalMs) * this.refillRate;

    if (tokensToAdd > 0) {
      bucket.tokens = Math.min(this.capacity, bucket.tokens + tokensToAdd);
      bucket.lastRefill = now;
    }
  }

  allow(key, tokensRequired = 1) {
    const bucket = this._getBucket(key);
    this._refill(bucket);

    if (bucket.tokens < tokensRequired) {
      const tokensNeeded = tokensRequired - bucket.tokens;
      const waitMs = Math.ceil(tokensNeeded / this.refillRate) * this.refillIntervalMs;
      return { allowed: false, tokens: bucket.tokens, retryAfter: waitMs };
    }

    bucket.tokens -= tokensRequired;
    return { allowed: true, tokens: bucket.tokens };
  }
}

// ─── 分布式限流（Redis Lua 脚本，仅展示逻辑）────────────────────────────────

const REDIS_SLIDING_WINDOW_SCRIPT = `
-- 滑动窗口限流 Lua 脚本（在真实 Redis 中使用）
-- KEYS[1] = rate_limit:{userId}
-- ARGV[1] = 窗口大小（ms）
-- ARGV[2] = 最大请求数
-- ARGV[3] = 当前时间戳（ms）

local key = KEYS[1]
local window = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local min_score = now - window

-- 移除窗口外的旧请求记录
redis.call('ZREMRANGEBYSCORE', key, '-inf', min_score)

-- 计算当前窗口内的请求数
local current = redis.call('ZCARD', key)

if current < limit then
  -- 添加当前请求（score=时间戳，member=唯一ID）
  redis.call('ZADD', key, now, now .. '-' .. math.random())
  redis.call('PEXPIRE', key, window)
  return {1, limit - current - 1}  -- allowed, remaining
else
  return {0, 0}  -- denied
end
`;

// ─── 演示 ─────────────────────────────────────────────────────────────────────

function runDemo(name, limiter, key, totalRequests, intervalMs = 0) {
  console.log(`\n【${name}】(limit=${limiter.limit || limiter.capacity}, window=${limiter.windowMs || limiter.refillIntervalMs}ms)`);
  let allowed = 0;
  let denied = 0;

  for (let i = 0; i < totalRequests; i++) {
    const result = limiter.allow(key);
    if (result.allowed) {
      allowed++;
      process.stdout.write('✓');
    } else {
      denied++;
      process.stdout.write('✗');
    }
  }
  console.log(`\n  通过: ${allowed}, 拒绝: ${denied}`);
}

async function main() {
  console.log('='.repeat(60));
  console.log('  限流算法演示');
  console.log('='.repeat(60));

  // 固定窗口：每秒5个
  const fixedWindow = new FixedWindowRateLimiter({ limit: 5, windowMs: 1000 });
  runDemo('固定窗口（Fixed Window）', fixedWindow, 'user1', 10);

  // 滑动窗口日志：每秒5个
  const slidingLog = new SlidingWindowLogLimiter({ limit: 5, windowMs: 1000 });
  runDemo('滑动窗口日志（Sliding Window Log）', slidingLog, 'user2', 10);

  // 滑动窗口计数：每秒5个
  const slidingCounter = new SlidingWindowCounterLimiter({ limit: 5, windowMs: 1000 });
  runDemo('滑动窗口计数（Sliding Window Counter）', slidingCounter, 'user3', 10);

  // 令牌桶：容量5，每秒补充2个 — 演示突发后被限流
  const tokenBucket = new TokenBucketLimiter({ capacity: 5, refillRate: 2, refillIntervalMs: 1000 });
  console.log('\n【令牌桶（Token Bucket）】(capacity=5, refill=2/s)');
  let allowed = 0, denied = 0;
  for (let i = 0; i < 8; i++) {
    const result = tokenBucket.allow('user4');
    if (result.allowed) {
      allowed++;
      process.stdout.write(`✓(${result.tokens}剩余)`);
    } else {
      denied++;
      process.stdout.write(`✗(需等${result.retryAfter}ms)`);
    }
  }
  console.log(`\n  通过: ${allowed}, 拒绝: ${denied}`);

  console.log('\n' + '─'.repeat(40));
  console.log('\n【Redis Lua 脚本（分布式限流）— 仅展示逻辑】');
  console.log('在 ioredis 中使用:');
  console.log(`
  const result = await redis.eval(
    SCRIPT, 1,
    \`rate_limit:\${userId}\`,
    windowMs, limit, Date.now()
  );
  const [allowed, remaining] = result;
  `);

  console.log('\n' + '='.repeat(60));
  console.log('  算法对比');
  console.log('='.repeat(60));
  console.log(`
  ┌──────────────────┬───────────┬──────────┬──────────────┐
  │ 算法              │ 精确度    │ 内存     │ 突发流量     │
  ├──────────────────┼───────────┼──────────┼──────────────┤
  │ 固定窗口          │ 中（有刺）│ O(1)     │ 2x 边界突刺  │
  │ 滑动窗口日志      │ 高        │ O(limit) │ 精确控制     │
  │ 滑动窗口计数      │ 中高      │ O(1)     │ 近似控制     │
  │ 令牌桶            │ 高        │ O(1)     │ 允许小突发   │
  │ Redis Lua         │ 高（分布式）│ O(limit)│ 精确控制   │
  └──────────────────┴───────────┴──────────┴──────────────┘
  `);
}

main().catch(console.error);
