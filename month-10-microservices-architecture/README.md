# Month 10 — 微服务架构

## 学习目标

掌握微服务核心模式：gRPC、消息队列、Saga、熔断器。

---

## 进度追踪

| # | 任务 | 类型 | 状态 | 完成日期 |
|---|------|------|------|---------|
| 1 | 阅读 microservices-patterns.md | 笔记 | ⬜ | |
| 2 | 阅读 grpc-and-protobuf.md | 笔记 | ⬜ | |
| 3 | 阅读 event-driven-architecture.md | 笔记 | ⬜ | |
| 4 | 运行 demo-grpc.js | 实践 | ⬜ | |
| 5 | 运行 demo-saga.js | 实践 | ⬜ | |
| 6 | 运行 demo-circuit-breaker.js | 实践 | ⬜ | |
| 7 | 完成月度分享 slides.md | 输出 | ⬜ | |

---

## 核心概念速览

```
Circuit Breaker 状态机:
  CLOSED → (失败率超阈值) → OPEN → (超时后) → HALF_OPEN → (成功) → CLOSED

Saga 模式（编排式）:
  OrderService → PaymentService → InventoryService
  ← CancelInventory ← CancelPayment ← (失败时补偿)
```

## 参考资料

- [gRPC Node.js](https://grpc.io/docs/languages/node/)
- [BullMQ](https://docs.bullmq.io/)
- [Martin Fowler: Circuit Breaker](https://martinfowler.com/bliki/CircuitBreaker.html)
- [Microservices Patterns (Book)](https://microservices.io/patterns/)
