/**
 * demo-graceful-shutdown.js
 * Node.js 优雅关机实现：处理 SIGTERM/SIGINT，等待请求完成
 */

'use strict';

const http = require('http');

// ─── 请求追踪器 ────────────────────────────────────────────────────────────────

class RequestTracker {
  constructor() {
    this._activeRequests = new Set();
  }

  add(req) {
    this._activeRequests.add(req);
    req.on('close', () => this._activeRequests.delete(req));
  }

  get count() { return this._activeRequests.size; }

  // 等待所有活跃请求完成
  drain(timeoutMs = 30000) {
    if (this._activeRequests.size === 0) return Promise.resolve();

    return new Promise((resolve) => {
      const deadline = setTimeout(() => {
        console.log(`⚠️  ${this._activeRequests.size} 个请求超时强制关闭`);
        resolve();
      }, timeoutMs);

      const check = () => {
        if (this._activeRequests.size === 0) {
          clearTimeout(deadline);
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }
}

// ─── 应用服务器 ────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const tracker = new RequestTracker();
let isShuttingDown = false;

const server = http.createServer(async (req, res) => {
  // 关机期间拒绝新请求
  if (isShuttingDown) {
    res.writeHead(503, { 'Retry-After': '5' });
    return res.end(JSON.stringify({ error: 'Server is shutting down' }));
  }

  tracker.add(req);

  const path = req.url;

  if (path === '/health') {
    res.writeHead(200);
    return res.end(JSON.stringify({ status: 'ok', activeRequests: tracker.count }));
  }

  if (path === '/slow') {
    // 模拟耗时请求（3 秒）
    console.log(`[${new Date().toISOString()}] 收到慢请求，处理中...`);
    await sleep(3000);
    res.writeHead(200);
    return res.end(JSON.stringify({ done: true }));
  }

  res.writeHead(200);
  res.end(JSON.stringify({ path, time: new Date().toISOString() }));
});

// ─── 优雅关机逻辑 ──────────────────────────────────────────────────────────────

async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n[${signal}] 收到关机信号，开始优雅关机...`);
  console.log(`当前活跃请求数: ${tracker.count}`);

  // 步骤 1: 停止接受新连接
  server.close(() => {
    console.log('HTTP 服务器已停止接受新连接');
  });

  // 步骤 2: 等待现有请求完成（最多 30 秒）
  console.log('等待现有请求完成...');
  await tracker.drain(30000);

  // 步骤 3: 关闭数据库连接、消息队列等
  console.log('关闭数据库连接...');
  await sleep(100); // 模拟 DB 连接关闭

  console.log('关闭 Redis 连接...');
  await sleep(50); // 模拟 Redis 连接关闭

  // 步骤 4: 退出
  console.log('✅ 优雅关机完成');
  process.exit(0);
}

// 超时强制退出（防止无限等待）
const FORCE_EXIT_TIMEOUT = process.env.FORCE_EXIT_TIMEOUT || 35000;
function startForceExitTimer() {
  setTimeout(() => {
    console.error('❌ 强制退出（优雅关机超时）');
    process.exit(1);
  }, FORCE_EXIT_TIMEOUT).unref(); // .unref() 不阻止进程正常退出
}

process.on('SIGTERM', () => {
  startForceExitTimer();
  gracefulShutdown('SIGTERM');
});

process.on('SIGINT', () => {
  startForceExitTimer();
  gracefulShutdown('SIGINT');
});

// 未捕获的错误
process.on('uncaughtException', (err) => {
  console.error('未捕获异常:', err);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  console.error('未处理的 Promise 拒绝:', reason);
  gracefulShutdown('unhandledRejection');
});

// ─── 启动 ──────────────────────────────────────────────────────────────────────

server.listen(3010, () => {
  console.log('服务器启动在 http://localhost:3010');
  console.log('测试端点:');
  console.log('  GET /health - 健康检查');
  console.log('  GET /slow   - 慢请求（3 秒）');
  console.log('\n测试优雅关机:');
  console.log('  1. 发送 GET /slow 请求（不等待响应）');
  console.log('  2. 立即按 Ctrl+C');
  console.log('  3. 观察服务器等待 /slow 请求完成后才退出');

  // 演示模式：30 秒后自动发送 SIGTERM
  if (process.env.DEMO_MODE) {
    console.log('\n[DEMO] 5 秒后自动发送慢请求，然后触发关机...');
    setTimeout(async () => {
      // 发送慢请求
      http.get('http://localhost:3010/slow').on('response', res => {
        console.log(`慢请求响应: ${res.statusCode}`);
      });

      // 2 秒后发送 SIGTERM（慢请求还在执行中）
      await sleep(1000);
      console.log('\n[DEMO] 发送 SIGTERM 信号...');
      process.emit('SIGTERM');
    }, 2000);
  }
});
