# 性能指标与可观测性

## 1. 四个黄金信号（Google SRE）

```
延迟 (Latency)   → 请求处理时间（P50, P95, P99）
流量 (Traffic)   → RPS（每秒请求数）
错误 (Errors)    → 错误率 = 失败请求 / 总请求
饱和度 (Saturation) → CPU、内存、连接池使用率
```

---

## 2. Prometheus + prom-client

```javascript
// npm install prom-client
const client = require('prom-client');
const register = new client.Registry();

// 默认指标（Node.js 内置）
client.collectDefaultMetrics({ register });

// HTTP 请求持续时间（Histogram）
const httpDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [register],
});

// Express 中间件
app.use((req, res, next) => {
  const end = httpDuration.startTimer();
  res.on('finish', () => {
    end({ method: req.method, route: req.route?.path || 'unknown', status_code: res.statusCode });
  });
  next();
});

// 指标暴露端点
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

---

## 3. 指标类型

| 类型 | 用途 | 示例 |
|------|------|------|
| Counter | 只增不减 | 请求总数、错误总数 |
| Gauge | 可增可减 | 在线用户数、队列深度 |
| Histogram | 分布统计 | 请求延迟（P95/P99）|
| Summary | 滑动窗口分位数 | 类似 Histogram |

---

## 4. Node.js 内置指标

```javascript
// process 指标
process.memoryUsage()    // { heapUsed, heapTotal, rss, external }
process.cpuUsage()       // { user, system }（微秒）
process.uptime()         // 进程运行秒数
process.eventLoopUtilization() // 事件循环使用率

// libuv 事件循环延迟
const { monitorEventLoopDelay } = require('perf_hooks');
const h = monitorEventLoopDelay({ resolution: 20 });
h.enable();
setTimeout(() => {
  h.disable();
  console.log({
    min: h.min / 1e6 + 'ms',
    max: h.max / 1e6 + 'ms',
    p99: h.percentile(99) / 1e6 + 'ms',
  });
}, 5000);
```

---

## 5. 日志结构化

```javascript
// npm install pino
const pino = require('pino');
const logger = pino({
  level: 'info',
  formatters: { level: (label) => ({ level: label }) },
});

// 结构化日志（便于 ELK/Loki 查询）
logger.info({ userId: 123, action: 'login', ip: '1.2.3.4' }, 'User logged in');
// → {"level":"info","time":1700000000,"userId":123,"action":"login","ip":"1.2.3.4","msg":"User logged in"}

// 请求日志中间件
app.use((req, res, next) => {
  req.log = logger.child({ requestId: crypto.randomUUID() });
  const start = Date.now();
  res.on('finish', () => {
    req.log.info({
      method: req.method, path: req.path,
      statusCode: res.statusCode, duration: Date.now() - start,
    }, 'request completed');
  });
  next();
});
```

---

## 6. 实践 Checklist

- [ ] 集成 prom-client，暴露 /metrics 端点
- [ ] 用 Histogram 记录 API 延迟，查看 P99
- [ ] 用 Docker Compose 运行 Prometheus + Grafana，配置 Node.js Dashboard
- [ ] 监控事件循环延迟，在 CPU 密集操作时观察变化
