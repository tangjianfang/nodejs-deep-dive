/**
 * demo-prometheus.js
 * 演示 Prometheus 指标收集（不依赖 prom-client，手动实现）
 * 运行: node demo-prometheus.js，访问 http://localhost:3009/metrics
 */

'use strict';

const http = require('http');
const { performance } = require('perf_hooks');

// ─── 轻量指标注册表 ────────────────────────────────────────────────────────────

class MetricsRegistry {
  constructor() {
    this._metrics = new Map();
  }

  counter(name, help, labels = []) {
    const m = new Counter(name, help, labels);
    this._metrics.set(name, m);
    return m;
  }

  gauge(name, help, labels = []) {
    const m = new Gauge(name, help, labels);
    this._metrics.set(name, m);
    return m;
  }

  histogram(name, help, labels = [], buckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1]) {
    const m = new Histogram(name, help, labels, buckets);
    this._metrics.set(name, m);
    return m;
  }

  format() {
    return [...this._metrics.values()].map(m => m.format()).join('\n');
  }
}

class Counter {
  constructor(name, help, labelNames) {
    this.name = name; this.help = help; this.labelNames = labelNames;
    this._values = new Map();
  }
  _key(labels) { return JSON.stringify(labels); }
  inc(labels = {}, amount = 1) {
    const k = this._key(labels);
    this._values.set(k, (this._values.get(k) || 0) + amount);
    return this;
  }
  format() {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`];
    for (const [k, v] of this._values) {
      const labels = JSON.parse(k);
      const lstr = Object.entries(labels).map(([k,v]) => `${k}="${v}"`).join(',');
      lines.push(`${this.name}{${lstr}} ${v}`);
    }
    return lines.join('\n');
  }
}

class Gauge {
  constructor(name, help, labelNames) {
    this.name = name; this.help = help; this.labelNames = labelNames;
    this._values = new Map();
  }
  _key(labels) { return JSON.stringify(labels); }
  set(labels = {}, value) { this._values.set(this._key(labels), value); return this; }
  inc(labels = {}, amount = 1) { this._values.set(this._key(labels), (this._values.get(this._key(labels)) || 0) + amount); return this; }
  dec(labels = {}, amount = 1) { return this.inc(labels, -amount); }
  format() {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} gauge`];
    for (const [k, v] of this._values) {
      const labels = JSON.parse(k);
      const lstr = Object.entries(labels).map(([k,v]) => `${k}="${v}"`).join(',');
      lines.push(`${this.name}{${lstr}} ${v}`);
    }
    return lines.join('\n');
  }
}

class Histogram {
  constructor(name, help, labelNames, buckets) {
    this.name = name; this.help = help; this.labelNames = labelNames;
    this.buckets = [...buckets].sort((a,b) => a-b);
    this._data = new Map();
  }
  _key(labels) { return JSON.stringify(labels); }
  observe(labels = {}, value) {
    const k = this._key(labels);
    if (!this._data.has(k)) {
      this._data.set(k, { sum: 0, count: 0, buckets: new Map(this.buckets.map(b => [b, 0])) });
    }
    const d = this._data.get(k);
    d.sum += value; d.count++;
    for (const b of this.buckets) { if (value <= b) d.buckets.set(b, d.buckets.get(b) + 1); }
    return this;
  }
  startTimer(labels = {}) {
    const start = performance.now();
    return () => this.observe(labels, (performance.now() - start) / 1000);
  }
  format() {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`];
    for (const [k, d] of this._data) {
      const labels = JSON.parse(k);
      const lbase  = Object.entries(labels).map(([k,v]) => `${k}="${v}"`).join(',');
      for (const [b, c] of d.buckets) {
        lines.push(`${this.name}_bucket{${lbase ? lbase + ',' : ''}le="${b}"} ${c}`);
      }
      lines.push(`${this.name}_bucket{${lbase ? lbase + ',' : ''}le="+Inf"} ${d.count}`);
      lines.push(`${this.name}_sum{${lbase}} ${d.sum}`);
      lines.push(`${this.name}_count{${lbase}} ${d.count}`);
    }
    return lines.join('\n');
  }
}

// ─── 注册指标 ──────────────────────────────────────────────────────────────────

const registry = new MetricsRegistry();

const httpRequests = registry.counter(
  'http_requests_total',
  'Total number of HTTP requests',
  ['method', 'path', 'status']
);

const httpDuration = registry.histogram(
  'http_request_duration_seconds',
  'HTTP request duration in seconds',
  ['method', 'path'],
  [0.005, 0.01, 0.05, 0.1, 0.5, 1, 5]
);

const activeConnections = registry.gauge(
  'http_active_connections',
  'Number of active HTTP connections'
);

const memoryGauge = registry.gauge(
  'nodejs_heap_used_bytes',
  'Node.js heap used bytes'
);

// ─── 模拟 HTTP 服务器 ──────────────────────────────────────────────────────────

const routes = {
  '/api/users': async () => {
    await sleep(random(10, 80));
    return { users: [{ id: 1, name: 'Alice' }] };
  },
  '/api/orders': async () => {
    await sleep(random(50, 200));
    return { orders: [] };
  },
  '/api/slow': async () => {
    await sleep(random(500, 1500)); // 刻意制造慢接口
    return { data: 'slow response' };
  },
};

const server = http.createServer(async (req, res) => {
  const path = req.url.split('?')[0];

  if (path === '/metrics') {
    // 更新内存指标
    memoryGauge.set({}, process.memoryUsage().heapUsed);
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end(registry.format());
  }

  activeConnections.inc({});
  const endTimer = httpDuration.startTimer({ method: req.method, path });

  try {
    const handler = routes[path];
    if (!handler) {
      httpRequests.inc({ method: req.method, path, status: '404' });
      res.writeHead(404);
      return res.end(JSON.stringify({ error: 'Not Found' }));
    }
    const result = await handler();
    httpRequests.inc({ method: req.method, path, status: '200' });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (err) {
    httpRequests.inc({ method: req.method, path, status: '500' });
    res.writeHead(500);
    res.end(JSON.stringify({ error: err.message }));
  } finally {
    endTimer();
    activeConnections.dec({});
  }
});

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function random(min, max) { return min + Math.floor(Math.random() * (max - min)); }

// ─── 模拟流量 ──────────────────────────────────────────────────────────────────

async function simulateTraffic() {
  const paths = ['/api/users', '/api/orders', '/api/slow', '/api/unknown'];
  while (true) {
    const path = paths[Math.floor(Math.random() * paths.length)];
    http.get(`http://localhost:3009${path}`).on('error', () => {});
    await sleep(random(200, 800));
  }
}

server.listen(3009, () => {
  console.log('Metrics 服务器运行在 http://localhost:3009');
  console.log('  访问 http://localhost:3009/metrics 查看 Prometheus 格式指标');
  console.log('  访问 http://localhost:3009/api/users 等触发流量');
  console.log('\n模拟流量中...\n');
  simulateTraffic();

  // 5 秒后打印指标摘要
  setTimeout(async () => {
    const res = await new Promise(resolve => {
      http.get('http://localhost:3009/metrics', resolve);
    });
    let body = '';
    res.on('data', d => body += d);
    res.on('end', () => {
      console.log('\n=== 当前 Prometheus 指标 ===\n');
      console.log(body.split('\n').filter(l => !l.startsWith('#') && l.trim()).join('\n'));
      server.close();
      process.exit(0);
    });
  }, 5000);
});
