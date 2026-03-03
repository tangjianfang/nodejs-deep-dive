/**
 * 🔗 demo-async-local-storage.js
 * AsyncLocalStorage：请求 ID 全链路自动传递
 *
 * 运行：node demo-async-local-storage.js
 */

'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');
const { performance } = require('node:perf_hooks');

// ─────────────────────────────────────────────
// 1. 创建 AsyncLocalStorage 实例
// ─────────────────────────────────────────────

const requestContext = new AsyncLocalStorage();

// ─────────────────────────────────────────────
// 2. 日志函数：自动从上下文中获取 requestId
// ─────────────────────────────────────────────

function log(level, message, meta = {}) {
  const ctx = requestContext.getStore();
  const timestamp = new Date().toISOString();
  const requestId = ctx?.requestId ?? 'NO-CONTEXT';
  const userId = ctx?.userId ?? '-';

  // 结构化日志（pino 风格）
  const logEntry = {
    timestamp,
    level,
    requestId,
    userId,
    message,
    ...meta,
  };
  console.log(JSON.stringify(logEntry));
}

// ─────────────────────────────────────────────
// 3. 各层服务（无需手动传 requestId）
// ─────────────────────────────────────────────

// 数据库层
async function queryDatabase(sql) {
  const startTime = performance.now();
  // 模拟 DB 查询延迟
  await new Promise((r) => setTimeout(r, 15 + Math.random() * 20));
  const duration = performance.now() - startTime;

  log('info', 'Database query executed', {
    sql: sql.substring(0, 50),
    durationMs: duration.toFixed(2),
    layer: 'database',
  });

  return { rows: [{ id: 1, name: 'Alice' }] };
}

// 缓存层
async function getFromCache(key) {
  log('debug', 'Cache lookup', { key, layer: 'cache' });
  await new Promise((r) => setTimeout(r, 2));
  return null; // cache miss
}

async function setCache(key, value, ttl) {
  await new Promise((r) => setTimeout(r, 1));
  log('debug', 'Cache set', { key, ttl, layer: 'cache' });
}

// Repository 层
async function userRepository(userId) {
  log('debug', 'UserRepository.findById called', { userId, layer: 'repository' });

  const cached = await getFromCache(`user:${userId}`);
  if (cached) return cached;

  const { rows } = await queryDatabase(`SELECT * FROM users WHERE id = ${userId}`);
  const user = rows[0];
  await setCache(`user:${userId}`, user, 300);
  return user;
}

// Service 层
async function userService(userId) {
  log('info', 'UserService.getUser called', { userId, layer: 'service' });

  try {
    const user = await userRepository(userId);
    log('info', 'UserService.getUser success', { userId, layer: 'service' });
    return user;
  } catch (e) {
    log('error', 'UserService.getUser failed', { userId, error: e.message, layer: 'service' });
    throw e;
  }
}

// Controller 层（模拟 HTTP handler）
async function handleGetUser(reqId, userId) {
  const store = {
    requestId: reqId,
    userId,
    startTime: performance.now(),
    path: `/api/users/${userId}`,
  };

  // AsyncLocalStorage.run() 建立上下文
  // 在 run() 内部（包括所有异步操作）都可以访问 store
  return requestContext.run(store, async () => {
    log('info', 'Request received', { method: 'GET', path: store.path });

    const user = await userService(userId);
    const duration = performance.now() - store.startTime;

    log('info', 'Request completed', {
      statusCode: 200,
      durationMs: duration.toFixed(2),
    });

    return user;
  });
}

// ─────────────────────────────────────────────
// 4. 演示：并发请求，日志不会混淆
// ─────────────────────────────────────────────

async function main() {
  console.log('=== AsyncLocalStorage 链路追踪演示 ===\n');
  console.log('同时发起 3 个并发请求，观察每条日志都携带正确的 requestId：\n');
  console.log('─'.repeat(60));

  // 并发发起 3 个请求
  await Promise.all([
    handleGetUser('req-abc-001', 1),
    handleGetUser('req-xyz-002', 2),
    handleGetUser('req-def-003', 3),
  ]);

  console.log('─'.repeat(60));
  console.log('\n💡 关键观察：');
  console.log('  - 所有日志都携带了正确的 requestId');
  console.log('  - 从 Controller → Service → Repository → Database → Cache');
  console.log('  - 无需在任何函数签名中传递 requestId 参数');
  console.log('  - 即使是并发请求，日志也不会相互混淆');

  // 在上下文外访问
  console.log('\n🔍 上下文外访问：');
  const outsideCtx = requestContext.getStore();
  console.log('  requestContext.getStore() outside run():', outsideCtx);  // undefined
}

main().catch(console.error);
