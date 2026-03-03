/**
 * demo-memory-leak.js
 * 演示 Node.js 中常见的内存泄漏模式及检测方法
 */

'use strict';

const { EventEmitter } = require('events');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function formatMB(bytes) { return (bytes / 1024 / 1024).toFixed(1) + ' MB'; }

function printMemory(label) {
  const m = process.memoryUsage();
  console.log(`[${label}] heap: ${formatMB(m.heapUsed)} / ${formatMB(m.heapTotal)}, rss: ${formatMB(m.rss)}`);
}

// ─── 泄漏 1：全局无界缓存 ──────────────────────────────────────────────────────

async function leakGlobalCache() {
  console.log('\n=== 泄漏 1：无界全局缓存 ===');
  printMemory('初始');

  const BROKEN_CACHE = {};  // ❌ 永远增长

  for (let i = 0; i < 50000; i++) {
    BROKEN_CACHE[`user:${i}`] = {
      id: i, name: `User-${i}`,
      data: Buffer.alloc(100).fill(i % 256),
    };
  }

  printMemory('50000 条缓存后');

  // 修复：有界 LRU Cache
  const LRU = new Map();
  const MAX = 1000;
  function lruSet(key, value) {
    if (LRU.size >= MAX) LRU.delete(LRU.keys().next().value); // 删除最旧的
    LRU.set(key, value);
  }

  for (let i = 0; i < 50000; i++) {
    lruSet(`user:${i}`, { id: i, name: `User-${i}` });
  }

  console.log(`✅ LRU 缓存大小: ${LRU.size} (最多 ${MAX})`);
  printMemory('LRU 后');
}

// ─── 泄漏 2：EventEmitter 监听器堆积 ──────────────────────────────────────────

async function leakEventListeners() {
  console.log('\n=== 泄漏 2：EventEmitter 监听器堆积 ===');

  const emitter = new EventEmitter();
  emitter.setMaxListeners(200); // 抑制警告（仅用于演示）

  // ❌ 每次请求都添加监听器，但不移除
  function badRequestHandler(requestId) {
    emitter.on('data', (data) => {
      // 处理数据... 但这个监听器永远不会被移除！
    });
  }

  // 模拟 100 次请求
  for (let i = 0; i < 100; i++) badRequestHandler(i);
  console.log(`❌ 监听器数量: ${emitter.listenerCount('data')} (持续增长)`);

  // ✅ 修复：使用 once 或手动移除
  const goodEmitter = new EventEmitter();
  function goodRequestHandler(requestId) {
    const handler = (data) => { /* 处理 */ };
    goodEmitter.once('data', handler); // 自动移除
    // 或: setTimeout(() => goodEmitter.off('data', handler), 30000);
  }

  for (let i = 0; i < 100; i++) goodRequestHandler(i);
  await sleep(10); // 触发 once 清理
  console.log(`✅ 监听器数量（once）: ${goodEmitter.listenerCount('data')} (使用后自动清理)`);
}

// ─── 泄漏 3：闭包持有大对象 ───────────────────────────────────────────────────

async function leakClosure() {
  console.log('\n=== 泄漏 3：闭包意外持有大对象 ===');
  printMemory('初始');

  const handlers = [];

  // ❌ bigData 被所有 handler 的闭包引用，无法被 GC
  function createLeakingHandler() {
    const bigData = Buffer.alloc(1024 * 1024).fill(42); // 1 MB
    return function handler(req) {
      // 实际上不需要 bigData，但闭包仍然持有它！
      return req.id;
    };
  }

  for (let i = 0; i < 20; i++) handlers.push(createLeakingHandler());
  printMemory('20 个泄漏处理器后（约 20MB）');

  // ✅ 修复：不在闭包中引用不需要的大对象
  const goodHandlers = [];
  function createGoodHandler() {
    // bigData 在函数执行完后可被 GC（没有被闭包捕获）
    const id = Buffer.alloc(1024 * 1024).fill(42)[0]; // 只保留需要的值
    return function handler(req) {
      return req.id + id;
    };
  }

  // 清理泄漏的 handlers
  handlers.length = 0;
  if (global.gc) { global.gc(); await sleep(100); }
  printMemory('清理后');
}

// ─── 泄漏 4：未清理的 Timer/Interval ─────────────────────────────────────────

async function leakTimers() {
  console.log('\n=== 泄漏 4：未清理的 Timer ===');

  class ConnectionPool {
    constructor() {
      this.connections = [];
      // ❌ 如果 Pool 对象被丢弃，这个 interval 仍然运行！
      this._healthCheckTimer = setInterval(() => {
        // Health check...
      }, 1000);
    }

    destroy() {
      // ✅ 必须提供清理方法
      clearInterval(this._healthCheckTimer);
      this.connections = [];
      console.log('  Pool 已销毁，Timer 已清理');
    }
  }

  const pool = new ConnectionPool();
  await sleep(100);
  pool.destroy(); // ✅ 正确清理
  console.log('  ✅ Timer 已清理，不会阻止进程退出');
}

// ─── 内存趋势监控 ──────────────────────────────────────────────────────────────

function startMemoryMonitor(intervalMs = 1000) {
  const samples = [];
  const id = setInterval(() => {
    const m = process.memoryUsage();
    samples.push(m.heapUsed);
    if (samples.length > 10) samples.shift();

    // 简单的泄漏检测：最近 10 个样本是否持续增长
    if (samples.length === 10) {
      const trend = samples.every((v, i) => i === 0 || v >= samples[i - 1]);
      if (trend) console.warn('⚠️  内存持续增长，可能存在泄漏！');
    }
  }, intervalMs);
  return () => clearInterval(id);
}

// ─── 主程序 ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Node.js 内存泄漏演示');
  console.log('提示: node --expose-gc demo-memory-leak.js 可手动触发 GC\n');

  const stopMonitor = startMemoryMonitor(2000);

  await leakGlobalCache();
  await leakEventListeners();
  await leakClosure();
  await leakTimers();

  stopMonitor();

  console.log('\n=== 总结 ===');
  console.log('1. 无界缓存    → 使用 LRU / TTL 控制大小');
  console.log('2. 事件监听器  → 使用 once 或记得 off()');
  console.log('3. 闭包引用    → 不在闭包中保留不需要的引用');
  console.log('4. Timer 未清  → 对象销毁时 clearTimeout/clearInterval');
  printMemory('最终');
}

main().catch(console.error);
