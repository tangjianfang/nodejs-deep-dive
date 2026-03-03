/**
 * demo-redis-lock.js
 * 演示分布式锁：没有锁的竞态条件 vs SET NX EX 分布式锁
 * 无需真实 Redis：使用内存模拟 Redis 命令
 */

'use strict';

// ─── 内存模拟 Redis 客户端 ─────────────────────────────────────────────────────

class MockRedis {
  constructor() {
    this._data = new Map();
    this._timers = new Map();
  }

  // SET key value [EX seconds] [NX]
  async set(key, value, ...args) {
    const optMap = {};
    for (let i = 0; i < args.length; i += 2) {
      optMap[args[i].toUpperCase()] = args[i + 1];
    }

    const nx = 'NX' in optMap;
    const ex = optMap['EX'] ? parseInt(optMap['EX'], 10) : null;

    if (nx && this._data.has(key)) {
      return null; // NX: 只在 key 不存在时设置
    }

    this._data.set(key, value);

    // 清除旧的 expiry
    if (this._timers.has(key)) {
      clearTimeout(this._timers.get(key));
    }

    if (ex) {
      const timer = setTimeout(() => this._data.delete(key), ex * 1000);
      this._timers.set(key, timer);
    }

    return 'OK';
  }

  async get(key) {
    return this._data.get(key) ?? null;
  }

  async del(key) {
    this._timers.get(key) && clearTimeout(this._timers.get(key));
    this._timers.delete(key);
    return this._data.delete(key) ? 1 : 0;
  }

  // 原子 Lua 脚本（用于安全释放锁）
  async eval(script, numkeys, key, value) {
    // 模拟: if redis.call("get",KEYS[1]) == ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end
    const current = this._data.get(key);
    if (current === value) {
      await this.del(key);
      return 1;
    }
    return 0;
  }
}

const redis = new MockRedis();

// ─── 工具函数 ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

// ─── 问题演示：没有锁的竞态条件 ───────────────────────────────────────────────

// 模拟一个"库存扣减"操作（非原子性）
let inventory = 10; // 初始库存 10

async function deductWithoutLock(workerId) {
  // 读取库存
  const stock = inventory;
  if (stock <= 0) {
    console.log(`  Worker-${workerId}: 库存不足，跳过`);
    return false;
  }

  // 模拟处理延迟（竞态窗口）
  await sleep(10);

  // 扣减库存（基于之前读到的值）
  inventory = stock - 1;
  console.log(`  Worker-${workerId}: 扣减成功，剩余库存 ${inventory}`);
  return true;
}

async function demoRaceCondition() {
  console.log('\n========================================');
  console.log('❌ 竞态条件演示（没有锁）');
  console.log('========================================');
  inventory = 3; // 只有 3 件库存
  console.log(`初始库存: ${inventory}`);
  console.log('启动 10 个并发 Worker...\n');

  const workers = Array.from({ length: 10 }, (_, i) => deductWithoutLock(i + 1));
  await Promise.all(workers);

  console.log(`\n最终库存: ${inventory}`);
  console.log('⚠️  库存可能出现负数或错误（超卖问题）!');
}

// ─── 分布式锁实现 ──────────────────────────────────────────────────────────────

const RELEASE_LOCK_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  else
    return 0
  end
`;

/**
 * 获取分布式锁
 * @param {string} lockKey - 锁名称
 * @param {number} ttl - 过期时间（秒），防止死锁
 * @param {number} retries - 最大重试次数
 * @param {number} retryDelay - 重试间隔（毫秒）
 * @returns {{ lockValue: string } | null} - 成功返回锁句柄，失败返回 null
 */
async function acquireLock(lockKey, ttl = 10, retries = 3, retryDelay = 100) {
  const lockValue = randomId(); // 唯一值，用于安全释放

  for (let i = 0; i <= retries; i++) {
    const result = await redis.set(lockKey, lockValue, 'EX', ttl, 'NX');
    if (result === 'OK') {
      return { lockKey, lockValue };
    }
    if (i < retries) {
      console.log(`    [Lock] 获取锁失败，${retryDelay}ms 后重试 (${i + 1}/${retries})`);
      await sleep(retryDelay);
    }
  }
  return null; // 获取锁失败
}

/**
 * 释放分布式锁（原子操作，防止误删其他 Worker 的锁）
 */
async function releaseLock(lock) {
  const released = await redis.eval(RELEASE_LOCK_SCRIPT, 1, lock.lockKey, lock.lockValue);
  return released === 1;
}

/**
 * 带锁执行函数的高阶封装
 */
async function withLock(lockKey, fn, options = {}) {
  const lock = await acquireLock(lockKey, options.ttl, options.retries, options.retryDelay);
  if (!lock) {
    throw new Error(`Failed to acquire lock: ${lockKey}`);
  }
  try {
    return await fn();
  } finally {
    await releaseLock(lock);
  }
}

// ─── 有锁的正确实现 ────────────────────────────────────────────────────────────

let inventoryInRedis = 3; // 模拟存在 Redis 中的库存

async function deductWithLock(workerId) {
  const lockKey = 'inventory:lock';
  try {
    const result = await withLock(lockKey, async () => {
      // 临界区：只有持有锁的 Worker 才能进入
      const stock = inventoryInRedis;
      if (stock <= 0) {
        console.log(`  Worker-${workerId}: 库存不足，跳过`);
        return false;
      }
      await sleep(5); // 模拟业务处理
      inventoryInRedis = stock - 1;
      console.log(`  Worker-${workerId}: 扣减成功，剩余库存 ${inventoryInRedis}`);
      return true;
    }, { ttl: 5, retries: 5, retryDelay: 50 });
    return result;
  } catch (err) {
    console.log(`  Worker-${workerId}: 获取锁超时，放弃`);
    return false;
  }
}

async function demoDistributedLock() {
  console.log('\n========================================');
  console.log('✅ 分布式锁演示（SET NX EX）');
  console.log('========================================');
  inventoryInRedis = 3;
  console.log(`初始库存: ${inventoryInRedis}`);
  console.log('启动 10 个并发 Worker...\n');

  const workers = Array.from({ length: 10 }, (_, i) => deductWithLock(i + 1));
  await Promise.all(workers);

  console.log(`\n最终库存: ${inventoryInRedis}`);
  console.log('✅ 库存正确（不会出现超卖）!');
}

// ─── 演示锁过期保护（TTL 防死锁） ─────────────────────────────────────────────

async function demoLockExpiry() {
  console.log('\n========================================');
  console.log('🔒 锁 TTL 防死锁演示');
  console.log('========================================');

  const lockKey = 'ttl-demo:lock';

  // Worker-A 获取锁，但"崩溃"了（没有释放）
  const lockA = await acquireLock(lockKey, 2); // TTL 2 秒
  console.log('Worker-A 获取锁成功，然后模拟崩溃（不释放锁）');

  // Worker-B 尝试获取（失败）
  const lockB1 = await acquireLock(lockKey, 2, 0); // 不重试
  console.log(`Worker-B 立即尝试获取锁: ${lockB1 ? '成功' : '失败（符合预期）'}`);

  // 等待 TTL 过期
  console.log('等待 TTL 过期（2 秒）...');
  await sleep(2500);

  // Worker-B 再次尝试（锁已过期，应该成功）
  const lockB2 = await acquireLock(lockKey, 2, 0);
  console.log(`Worker-B TTL 过期后再试: ${lockB2 ? '成功（锁自动释放了）' : '失败'}`);
  if (lockB2) await releaseLock(lockB2);
}

// ─── 主程序 ────────────────────────────────────────────────────────────────────

async function main() {
  await demoRaceCondition();
  await demoDistributedLock();
  await demoLockExpiry();

  console.log('\n========================================');
  console.log('📊 分布式锁核心机制总结');
  console.log('========================================');
  console.log('1. SET key value NX EX ttl   ← 原子加锁 + 自动过期');
  console.log('2. value = 唯一 ID           ← 防止误删别人的锁');
  console.log('3. Lua 脚本释放锁            ← 原子性 "check-then-delete"');
  console.log('4. TTL 自动过期              ← 防止持有锁的进程崩溃导致死锁');
}

main().catch(console.error);
