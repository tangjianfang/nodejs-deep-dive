# 微服务设计模式

## 1. 微服务 vs 单体

```
单体架构:                 微服务架构:
  ┌─────────────────┐       ┌──────────┐  ┌───────────┐
  │  User Service   │       │   User   │  │  Orders   │
  │  Order Service  │  →    │ Service  │  │  Service  │
  │  Product Service│       └──────────┘  └───────────┘
  │  Auth Service   │       ┌──────────┐  ┌───────────┐
  └─────────────────┘       │  Product │  │   Auth    │
                            │  Service │  │  Service  │
                            └──────────┘  └───────────┘

优势: 独立部署、独立扩展、技术栈多样
劣势: 分布式复杂性、网络延迟、数据一致性
```

---

## 2. API Gateway 模式

```
Client → API Gateway → Service A
                    → Service B
                    → Service C

API Gateway 职责:
  ✅ 路由（根据 path/header 转发）
  ✅ 认证鉴权（统一 JWT 验证）
  ✅ 限流（Rate Limiting）
  ✅ 熔断（Circuit Breaker）
  ✅ 负载均衡
  ✅ 请求聚合（Backend for Frontend）
  ✅ 日志/监控
```

---

## 3. Saga 模式（分布式事务）

```
传统事务（ACID）在微服务中不适用

Saga: 将长事务拆分为一系列本地事务 + 补偿事务

订单 Saga（编排式）:
  OrderService  → 创建订单（pending）
      ↓ 成功
  InventoryService → 扣减库存
      ↓ 成功
  PaymentService → 扣款
      ↓ 成功
  OrderService   → 确认订单

  ← 任何一步失败，触发补偿事务（逆序回滚）:
  PaymentService → 退款
  InventoryService → 恢复库存
  OrderService → 取消订单
```

---

## 4. Circuit Breaker（熔断器）

```
状态机:
  CLOSED（正常）
    → 错误率超过阈值 → OPEN（熔断）
  OPEN（熔断，快速失败）
    → 超时后 → HALF_OPEN（试探）
  HALF_OPEN（试探）
    → 成功 → CLOSED
    → 失败 → OPEN

好处:
  - 防止故障扩散（服务 A 故障不拖垮服务 B）
  - 快速失败（不等超时）
  - 自动恢复
```

---

## 5. 服务发现

```javascript
// 简单的服务注册表
class ServiceRegistry {
  constructor() { this._services = new Map(); }

  register(name, { host, port, healthUrl }) {
    const instances = this._services.get(name) || [];
    instances.push({ host, port, healthUrl, healthy: true });
    this._services.set(name, instances);
  }

  // 轮询负载均衡
  discover(name) {
    const instances = (this._services.get(name) || []).filter(i => i.healthy);
    if (!instances.length) throw new Error(`No healthy instances of ${name}`);
    const instance = instances[this._roundRobinIndex(name, instances.length)];
    return `http://${instance.host}:${instance.port}`;
  }

  _roundRobinIndex(name, total) {
    const counters = this._counters || (this._counters = new Map());
    const next = ((counters.get(name) || 0) + 1) % total;
    counters.set(name, next);
    return next;
  }
}
```

---

## 6. 实践 Checklist

- [ ] 用 EventEmitter 实现编排式 Saga，包含补偿逻辑
- [ ] 实现三状态 Circuit Breaker（CLOSED/OPEN/HALF_OPEN）
- [ ] 实现 API Gateway（路由 + JWT 验证 + 限流）
- [ ] 对比 REST vs gRPC 的延迟和吞吐量
