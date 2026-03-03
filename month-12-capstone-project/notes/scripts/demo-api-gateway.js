/**
 * demo-api-gateway.js
 * 迷你 API 网关：路由 + JWT 验证 + 限流 + 熔断器
 * 集成 Month 07 (JWT) + Month 09 (限流) + Month 10 (Circuit Breaker)
 * run: node demo-api-gateway.js
 */

'use strict';

const http = require('http');
const crypto = require('crypto');

// ─── JWT RS256 验证（复用 Month 07 的实现）────────────────────────────────────

function base64urlEncode(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
function base64urlDecode(str) {
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

// 生成 RSA 密钥对（仅用于演示）
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });

function signJwt(payload, expSeconds = 3600) {
  const header = base64urlEncode(Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const body = base64urlEncode(Buffer.from(JSON.stringify({
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + expSeconds,
  })));
  const signing = `${header}.${body}`;
  const signature = crypto.sign('sha256', Buffer.from(signing), privateKey);
  return `${signing}.${base64urlEncode(signature)}`;
}

function verifyJwt(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format');

  const [header, payload, sig] = parts;
  const signing = `${header}.${payload}`;
  const isValid = crypto.verify(
    'sha256',
    Buffer.from(signing),
    publicKey,
    Buffer.from(sig.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
  );
  if (!isValid) throw new Error('Invalid JWT signature');

  const claims = JSON.parse(base64urlDecode(payload));
  if (claims.exp < Math.floor(Date.now() / 1000)) throw new Error('JWT expired');
  return claims;
}

// ─── 令牌桶限流器（复用 Month 09/12 的实现）──────────────────────────────────

class RateLimiter {
  constructor({ capacity = 10, refillRate = 5 } = {}) {
    this.capacity = capacity;
    this.refillRate = refillRate;    // tokens per second
    this._buckets = new Map();
  }

  allow(key) {
    const now = Date.now();
    if (!this._buckets.has(key)) {
      this._buckets.set(key, { tokens: this.capacity, lastRefill: now });
    }
    const bucket = this._buckets.get(key);
    const elapsed = (now - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsed * this.refillRate);
    bucket.lastRefill = now;

    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  }
}

// ─── 熔断器（复用 Month 10 的实现）──────────────────────────────────────────

const STATE = { CLOSED: 'CLOSED', OPEN: 'OPEN', HALF_OPEN: 'HALF_OPEN' };

class CircuitBreaker {
  constructor({ failureThreshold = 3, successThreshold = 2, timeout = 5000 } = {}) {
    this.failureThreshold = failureThreshold;
    this.successThreshold = successThreshold;
    this.timeout = timeout;
    this.state = STATE.CLOSED;
    this._failures = 0;
    this._successes = 0;
    this._nextAttempt = 0;
  }

  async execute(fn) {
    if (this.state === STATE.OPEN) {
      if (Date.now() < this._nextAttempt) throw new Error('Circuit OPEN');
      this.state = STATE.HALF_OPEN;
      this._successes = 0;
    }
    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (err) {
      this._onFailure();
      throw err;
    }
  }

  _onSuccess() {
    this._failures = 0;
    if (this.state === STATE.HALF_OPEN) {
      this._successes++;
      if (this._successes >= this.successThreshold) this.state = STATE.CLOSED;
    }
  }

  _onFailure() {
    this._failures++;
    if (this._failures >= this.failureThreshold || this.state === STATE.HALF_OPEN) {
      this.state = STATE.OPEN;
      this._nextAttempt = Date.now() + this.timeout;
    }
  }
}

// ─── 上游服务模拟 ─────────────────────────────────────────────────────────────

class UpstreamService {
  constructor(name, failRate = 0) {
    this.name = name;
    this.failRate = failRate;
    this._requestCount = 0;
  }

  async handle(path, body) {
    this._requestCount++;
    if (Math.random() < this.failRate) {
      throw new Error(`${this.name} service unavailable`);
    }
    await new Promise(r => setTimeout(r, 5 + Math.random() * 10));
    return { service: this.name, path, requestId: this._requestCount, data: `Response from ${this.name}` };
  }
}

// ─── API 网关 ─────────────────────────────────────────────────────────────────

class ApiGateway {
  constructor() {
    this.routes = new Map();         // path prefix → { service, breaker }
    this.rateLimiter = new RateLimiter({ capacity: 20, refillRate: 10 });
    this._requestLog = [];
  }

  addRoute(prefix, service, breakerOptions = {}) {
    this.routes.set(prefix, {
      service,
      breaker: new CircuitBreaker(breakerOptions),
    });
  }

  _findRoute(path) {
    for (const [prefix, route] of this.routes) {
      if (path.startsWith(prefix)) return route;
    }
    return null;
  }

  _log(entry) {
    this._requestLog.push({ ...entry, ts: new Date().toISOString() });
  }

  async handleRequest(req, res) {
    const startTime = Date.now();
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;

    // 1. 认证中间件
    if (path !== '/public') {
      const authHeader = req.headers['authorization'];
      if (!authHeader?.startsWith('Bearer ')) {
        this._log({ path, status: 401, error: 'Missing token' });
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Unauthorized: Missing Bearer token' }));
      }
      try {
        const token = authHeader.slice(7);
        req.user = verifyJwt(token);
      } catch (err) {
        this._log({ path, status: 401, error: err.message });
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: `Unauthorized: ${err.message}` }));
      }
    }

    // 2. 限流中间件
    const rateLimitKey = req.user?.sub || req.socket.remoteAddress;
    if (!this.rateLimiter.allow(rateLimitKey)) {
      this._log({ path, status: 429, userId: rateLimitKey });
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '1' });
      return res.end(JSON.stringify({ error: 'Too Many Requests' }));
    }

    // 3. 路由 + 熔断器
    const route = this._findRoute(path);
    if (!route) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Route not found' }));
    }

    try {
      const data = await route.breaker.execute(() => route.service.handle(path, {}));
      const duration = Date.now() - startTime;
      this._log({ path, status: 200, userId: rateLimitKey, duration });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ...data, user: req.user?.sub, latency: `${duration}ms` }));
    } catch (err) {
      const status = err.message.includes('Circuit OPEN') ? 503 : 502;
      this._log({ path, status, error: err.message, userId: rateLimitKey });
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message, status }));
    }
  }

  printStats() {
    const byStatus = {};
    for (const entry of this._requestLog) {
      byStatus[entry.status] = (byStatus[entry.status] || 0) + 1;
    }
    console.log('\n  API 网关请求统计:');
    for (const [status, count] of Object.entries(byStatus)) {
      console.log(`    ${status}: ${count} 次`);
    }
    console.log(`    总计: ${this._requestLog.length} 次`);
  }
}

// ─── 演示 ─────────────────────────────────────────────────────────────────────

function makeRequest(gateway, path, token) {
  return new Promise(resolve => {
    const req = {
      url: path,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      socket: { remoteAddress: '127.0.0.1' },
      user: null,
    };
    const chunks = [];
    const res = {
      writeHead(status, headers) { this.statusCode = status; },
      end(body) { resolve({ status: this.statusCode, body: JSON.parse(body) }); },
    };
    gateway.handleRequest(req, res);
  });
}

async function main() {
  console.log('='.repeat(60));
  console.log('  迷你 API 网关演示');
  console.log('='.repeat(60));

  // 创建网关
  const gateway = new ApiGateway();

  // 注册上游服务
  gateway.addRoute('/api/users', new UpstreamService('UserService', 0), { failureThreshold: 3 });
  gateway.addRoute('/api/orders', new UpstreamService('OrderService', 0.5), { failureThreshold: 2, timeout: 2000 });
  gateway.addRoute('/api/products', new UpstreamService('ProductService', 0), { failureThreshold: 3 });

  // 生成测试 JWT
  const validToken = signJwt({ sub: 'user123', role: 'user' });
  const expiredToken = signJwt({ sub: 'user456' }, -1); // 已过期

  console.log('\n[1] 未认证请求 → 401');
  const r1 = await makeRequest(gateway, '/api/users', null);
  console.log(`   ${r1.status}:`, r1.body.error);

  console.log('\n[2] 过期 JWT → 401');
  const r2 = await makeRequest(gateway, '/api/users', expiredToken);
  console.log(`   ${r2.status}:`, r2.body.error);

  console.log('\n[3] 合法请求 → 200');
  const r3 = await makeRequest(gateway, '/api/users/profile', validToken);
  console.log(`   ${r3.status}: service=${r3.body.service}, user=${r3.body.user}, latency=${r3.body.latency}`);

  console.log('\n[4] OrderService 高故障率 → 熔断演示');
  for (let i = 0; i < 6; i++) {
    const r = await makeRequest(gateway, '/api/orders', validToken);
    process.stdout.write(`${r.status} `);
  }
  console.log('');

  console.log('\n[5] ProductService 正常 → 200');
  const r5 = await makeRequest(gateway, '/api/products', validToken);
  console.log(`   ${r5.status}: ${r5.body.data}`);

  console.log('\n[6] 路由不存在 → 404');
  const r6 = await makeRequest(gateway, '/api/unknown', validToken);
  console.log(`   ${r6.status}:`, r6.body.error);

  gateway.printStats();

  console.log('\n' + '='.repeat(60));
  console.log('  网关功能总结');
  console.log('='.repeat(60));
  console.log(`
  中间件链:
  请求 → [JWT 验证] → [令牌桶限流] → [路由匹配] → [熔断器] → 上游服务

  ┌──────────────┬────────────────────────────────────┐
  │ 功能          │ 实现                               │
  ├──────────────┼────────────────────────────────────┤
  │ 认证          │ JWT RS256（Month 07）              │
  │ 限流          │ 令牌桶（Month 09/12）              │
  │ 熔断          │ Circuit Breaker（Month 10）        │
  │ 路由          │ 前缀匹配                           │
  │ 可观察性      │ 请求日志 + 状态统计                │
  └──────────────┴────────────────────────────────────┘
  `);
}

main().catch(console.error);
