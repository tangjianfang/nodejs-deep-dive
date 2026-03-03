# 第十月分享：微服务架构实战 — gRPC、消息队列与 Saga 模式

---

## Slide 1 — 封面

```
微服务架构实战
gRPC · 消息队列 · Saga 分布式事务

Month 10 · Node.js Deep Dive
```

🗣️ 大家好！本月我们进入微服务领域。微服务带来灵活性，也带来分布式复杂性。
**互动：大家项目是单体还是微服务？服务间如何通信？**

---

## Slide 2 — 熔断器：防止故障扩散

```
CLOSED → 正常调用
  ↓ 失败 N 次
OPEN → 快速失败（不调用下游）
  ↓ 等待 timeout
HALF_OPEN → 试探一两次
  ↓ 成功 → CLOSED
  ↓ 失败 → OPEN

好处:
  - 下游故障不拖垮上游
  - 快速失败（不等超时）
  - 自动恢复检测
```

🗣️ 演示 `demo-circuit-breaker.js`，现场展示三种状态转换。

---

## Slide 3 — Saga：分布式事务

```
单体: @Transactional → 全部成功 or 全部回滚

微服务:
  订单服务 + 库存服务 + 支付服务
  跨服务不能用数据库事务！

Saga 解法:
  1. 创建订单（pending）
  2. 锁定库存
  3. 扣款
  4. 确认订单
  ↓ 任何一步失败
  补偿事务（逆序回滚）
```

🗣️ 演示 `demo-saga.js`，展示库存不足时的补偿流程。

---

## Slide 4 — gRPC vs REST

```
特性            REST/JSON      gRPC/Protobuf
──────────────────────────────────────────
协议            HTTP/1.1       HTTP/2
序列化          文本           二进制
大小            大             小 3-10x
速度            基准           快 2-7x
类型安全        OpenAPI        .proto 文件
流式传输        困难           原生支持
浏览器          ✅             需 grpc-web
适用            公开 API       服务间通信
```

🗣️ 演示 `demo-grpc.js`，对比 JSON 和 Protobuf 的序列化大小。

---

## Slide 5 — 事件驱动架构

```
同步调用:   A → B → C（紧耦合）
事件驱动:   A → 消息总线 ← B
                       ← C

好处: 
  - 松耦合（发布者不知道订阅者）
  - 异步处理（提高吞吐量）
  - 易于扩展（新服务订阅事件即可）

挑战:
  - 消息幂等性（防止重复处理）
  - 消息顺序（需要 partition key）
  - 调试困难（链路追踪）
```

🗣️ 展示 EventBus 代码，讨论幂等性的重要性。

---

## Slide 6 — 下月预告：DevOps 部署

```
Month 11: 从代码到生产
  Docker 容器化（多阶段构建）
  Kubernetes 基础（Pod/Service/Deployment）
  GitHub Actions CI/CD 流水线
  优雅关机与健康检查
```

🗣️ **提问：大家的部署流程是什么？手动还是自动化 CI/CD？**
