/**
 * demo-health-check.js
 * 实现 Kubernetes 标准健康检查端点
 * liveness probe（存活）+ readiness probe（就绪）
 */

'use strict';

const http = require('http');

// ─── 健康状态管理 ──────────────────────────────────────────────────────────────

class HealthManager {
  constructor() {
    this._checks = new Map();         // 就绪检查项
    this._livenessChecks = new Map(); // 存活检查项
    this._startTime = Date.now();
    this._isShuttingDown = false;
  }

  // 注册就绪检查（Readiness: 服务是否可以接收流量）
  addReadinessCheck(name, checkFn) {
    this._checks.set(name, checkFn);
  }

  // 注册存活检查（Liveness: 服务是否需要重启）
  addLivenessCheck(name, checkFn) {
    this._livenessChecks.set(name, checkFn);
  }

  setShuttingDown(value) {
    this._isShuttingDown = value;
  }

  async checkReadiness() {
    if (this._isShuttingDown) {
      return { status: 'shutting_down', checks: {}, ready: false };
    }

    const results = {};
    let allHealthy = true;

    for (const [name, checkFn] of this._checks) {
      try {
        const start = Date.now();
        await checkFn();
        results[name] = { status: 'ok', latency: `${Date.now() - start}ms` };
      } catch (err) {
        results[name] = { status: 'error', error: err.message };
        allHealthy = false;
      }
    }

    return { status: allHealthy ? 'ready' : 'not_ready', checks: results, ready: allHealthy };
  }

  async checkLiveness() {
    const results = {};
    let alive = true;

    for (const [name, checkFn] of this._livenessChecks) {
      try {
        await checkFn();
        results[name] = { status: 'ok' };
      } catch (err) {
        results[name] = { status: 'error', error: err.message };
        alive = false;
      }
    }

    const uptime = Math.floor((Date.now() - this._startTime) / 1000);
    const mem = process.memoryUsage();

    return {
      status: alive ? 'alive' : 'unhealthy',
      uptime: `${uptime}s`,
      version: process.env.APP_VERSION || '1.0.0',
      nodeVersion: process.version,
      memory: {
        heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(mem.heapTotal / 1024 / 1024)}MB`,
        rss: `${Math.round(mem.rss / 1024 / 1024)}MB`,
      },
      checks: results,
      alive,
    };
  }
}

// ─── 模拟依赖 ──────────────────────────────────────────────────────────────────

let dbConnected = true;
let redisConnected = true;
let memoryLeakDetector = 0;

async function simulateDependencyChanges() {
  // 3 秒后模拟 Redis 断连（就绪检查失败）
  setTimeout(() => {
    console.log('\n模拟 Redis 断连...');
    redisConnected = false;
  }, 3000);

  // 5 秒后恢复
  setTimeout(() => {
    console.log('Redis 恢复连接...');
    redisConnected = true;
  }, 5000);

  // 8 秒后模拟内存泄漏检测
  setTimeout(() => {
    console.log('\n模拟内存使用率过高（存活检查失败）...');
    memoryLeakDetector = 999;
  }, 8000);
}

// ─── 健康管理器配置 ────────────────────────────────────────────────────────────

const health = new HealthManager();

// 就绪检查
health.addReadinessCheck('database', async () => {
  if (!dbConnected) throw new Error('Database connection lost');
  // 模拟 DB ping
  await new Promise(r => setTimeout(r, 5));
});

health.addReadinessCheck('redis', async () => {
  if (!redisConnected) throw new Error('Redis connection lost');
  await new Promise(r => setTimeout(r, 2));
});

// 存活检查（更宽松）
health.addLivenessCheck('event-loop', async () => {
  // 检查事件循环是否响应
  await new Promise(r => setImmediate(r));
});

health.addLivenessCheck('memory', async () => {
  if (memoryLeakDetector > 900) throw new Error('Memory usage too high');
  const { heapUsed, heapTotal } = process.memoryUsage();
  const usageRatio = heapUsed / heapTotal;
  if (usageRatio > 0.95) throw new Error(`Heap usage ${(usageRatio * 100).toFixed(0)}% critical`);
});

// ─── HTTP 服务器 ──────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url = req.url;

  // Kubernetes readiness probe: 返回 200 = 可以接收流量，503 = 不行
  if (url === '/ready' || url === '/readyz') {
    const result = await health.checkReadiness();
    res.writeHead(result.ready ? 200 : 503, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(result, null, 2));
  }

  // Kubernetes liveness probe: 返回 200 = 正常，500 = 需要重启
  if (url === '/health' || url === '/healthz' || url === '/livez') {
    const result = await health.checkLiveness();
    res.writeHead(result.alive ? 200 : 500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(result, null, 2));
  }

  // 详细状态（用于 Dashboard）
  if (url === '/status') {
    const [liveness, readiness] = await Promise.all([
      health.checkLiveness(),
      health.checkReadiness(),
    ]);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ liveness, readiness }, null, 2));
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(3011, () => {
  console.log('健康检查服务器运行在 http://localhost:3011');
  console.log('\n端点:');
  console.log('  GET /ready  - Readiness probe（就绪检查）');
  console.log('  GET /health - Liveness probe（存活检查）');
  console.log('  GET /status - 详细状态');
  console.log('\nKubernetes 配置示例:');
  console.log(`
  livenessProbe:
    httpGet: { path: /health, port: 3011 }
    initialDelaySeconds: 30
    periodSeconds: 10
    failureThreshold: 3

  readinessProbe:
    httpGet: { path: /ready, port: 3011 }
    initialDelaySeconds: 5
    periodSeconds: 5
    failureThreshold: 1
  `);

  simulateDependencyChanges();

  // 定期打印状态
  const interval = setInterval(async () => {
    const ready = await health.checkReadiness();
    const alive = await health.checkLiveness();
    console.log(`[健康状态] ready=${ready.ready} alive=${alive.alive} db=${dbConnected} redis=${redisConnected} memory=${memoryLeakDetector}`);
  }, 1000);

  // 12 秒后退出演示
  setTimeout(() => {
    clearInterval(interval);
    server.close(() => process.exit(0));
  }, 12000);
});
