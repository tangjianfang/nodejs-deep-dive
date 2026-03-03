# 第九月分享：Node.js 性能优化实战 — Worker Threads、缓存与可观测性

---

## Slide 1 — 封面

```
Node.js 性能优化实战
Worker Threads · 缓存策略 · Prometheus 可观测性

Month 09 · Node.js Deep Dive
```

🗣️ **互动：大家项目里最慢的接口是多少毫秒？有没有用过性能监控？**

---

## Slide 2 — 单线程的极限

```
Node.js 单线程事件循环:
  I/O 密集型   → ✅ 天生擅长（libuv 异步 I/O）
  CPU 密集型   → ❌ 阻塞整个事件循环！

fib(42) 单线程执行时:
  Event Loop 被完全阻塞 ~2-3 秒
  所有 HTTP 请求都要等待！

解决: Worker Threads（独立 V8 + 独立堆）
```

🗣️ 演示 `demo-worker-threads.js`，现场对比阻塞前后的响应时间。

---

## Slide 3 — Worker Threads 使用模式

```javascript
// 一次性任务
const worker = new Worker('./processor.js', { workerData: input });
worker.once('message', result => console.log(result));

// Worker Pool（推荐，避免频繁创建）
const pool = new WorkerPool(os.cpus().length);
const result = await pool.run(heavyData);

// 共享内存（SharedArrayBuffer）
const shared = new SharedArrayBuffer(4);
Atomics.add(new Int32Array(shared), 0, 1);
```

🗣️ Worker Pool 是生产环境的正确姿势。

---

## Slide 4 — 缓存三大问题

```
雪崩: 大量 key 同时过期
  → TTL += random(0, 300s)

穿透: 查询不存在的 key 每次都打 DB
  → 缓存空值 redis.set(key, "NULL", "EX", 60)

击穿: 热点 key 过期，并发重建
  → 互斥锁 + AsyncCache（共享 Promise）
```

🗣️ 演示 `demo-lru-cache.js`，展示 AsyncCache 防击穿效果。

---

## Slide 5 — Prometheus 四大指标类型

```
Counter   → 只增不减（总请求数、错误数）
Gauge     → 可增减（在线用户、队列深度）
Histogram → 分布（请求延迟 P50/P95/P99）
Summary   → 滑动窗口分位数

关键 PromQL:
  # P99 延迟
  histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))
  
  # 错误率
  rate(http_requests_total{status="500"}[5m]) / rate(http_requests_total[5m])
```

🗣️ 演示 `demo-prometheus.js`，访问 /metrics 端点。

---

## Slide 6 — 下月预告：微服务架构

```
Month 10: 微服务架构实战
  微服务设计模式（Saga、Circuit Breaker、API Gateway）
  gRPC + Protobuf（高性能 RPC）
  事件驱动架构（EventEmitter → 消息总线）
```

🗣️ **提问：大家项目是单体还是微服务？有没有遇到服务间调用失败的问题？**
