# Month 09 — 性能优化

## 学习目标

掌握 Worker Threads、LRU 缓存、性能指标采集和 Prometheus 监控集成。

---

## 进度追踪

| # | 任务 | 类型 | 状态 | 完成日期 |
|---|------|------|------|---------|
| 1 | 阅读 worker-threads.md | 笔记 | ⬜ | |
| 2 | 阅读 caching-strategies.md | 笔记 | ⬜ | |
| 3 | 阅读 performance-metrics.md | 笔记 | ⬜ | |
| 4 | 运行 demo-worker-threads.js | 实践 | ⬜ | |
| 5 | 运行 demo-lru-cache.js | 实践 | ⬜ | |
| 6 | 运行 demo-prometheus.js | 实践 | ⬜ | |
| 7 | 完成月度分享 slides.md | 输出 | ⬜ | |

---

## 核心概念速览

```
CPU 密集 → Worker Threads
内存缓存 → LRU (Map O(1) get/put)
可观测性 → Prometheus Counter/Histogram/Gauge
```

## 参考资料

- [Node.js Worker Threads](https://nodejs.org/api/worker_threads.html)
- [prom-client](https://github.com/siimon/prom-client)
- [Node.js perf_hooks](https://nodejs.org/api/perf_hooks.html)
