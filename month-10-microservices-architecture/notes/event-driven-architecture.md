# 事件驱动架构

## 1. 事件驱动 vs 请求/响应

```
请求/响应（同步）:
  服务 A ──── HTTP 请求 ────→ 服务 B
  服务 A ←─── HTTP 响应 ──── 服务 B
  特点: 紧耦合、同步等待

事件驱动（异步）:
  服务 A ──── 发布事件 ────→ 消息总线（队列）
  服务 B ←─── 订阅事件 ──── 消息总线
  特点: 松耦合、异步处理、高可用
```

---

## 2. 事件溯源（Event Sourcing）

```
传统:                          Event Sourcing:
  users 表                       events 表
  ┌──────────┬──────────┐         ┌──────────────────────────────────┐
  │ id │ name│ balance │         │ UserCreated   { id:1, name:"A" } │
  │  1 │ Alice│  500   │    →    │ Deposited     { userId:1, +200 } │
  │  2 │ Bob  │  300   │         │ Withdrawn     { userId:1, -100 } │
  └──────────┴──────────┘         │ UserCreated   { id:2, name:"B" } │
                                  └──────────────────────────────────┘

优点: 完整审计日志、时间旅行（回放到任意状态）、事件重放
缺点: 查询复杂（需要重放事件）、存储增长
```

---

## 3. CQRS（命令查询职责分离）

```
写模型 (Command):
  POST /users → UserCreated 事件
  PUT /users/:id → UserUpdated 事件
         ↓ 异步
读模型 (Query):
  GET /users → 从 ReadDB（可以是不同数据库）查询
       ↑ 
  EventHandler → 消费事件，更新 ReadDB

好处:
  - 读写分离，各自优化
  - 读模型可以有多个（全文搜索、推荐系统等）
  - 写模型轻量（只记录事件）
```

---

## 4. Node.js 事件总线实现

```javascript
const { EventEmitter } = require('events');

class EventBus extends EventEmitter {
  constructor() {
    super();
    this._middlewares = [];
    this._eventLog = [];
  }

  use(middleware) {
    this._middlewares.push(middleware);
    return this;
  }

  async publish(eventName, payload) {
    const event = {
      id: crypto.randomUUID(),
      type: eventName,
      timestamp: new Date().toISOString(),
      payload,
    };

    // 中间件处理（日志、验证、幂等性）
    for (const mw of this._middlewares) {
      await mw(event);
    }

    this._eventLog.push(event);
    this.emit(eventName, event);
    return event;
  }

  subscribe(eventName, handler) {
    this.on(eventName, handler);
    return () => this.off(eventName, handler); // 返回取消订阅函数
  }
}

// 使用
const bus = new EventBus();
bus.use(async (event) => console.log('[Event]', event.type, event.id));

const unsubscribe = bus.subscribe('ORDER_CREATED', async (event) => {
  await inventoryService.reserveStock(event.payload.items);
});

await bus.publish('ORDER_CREATED', { orderId: '123', items: [...] });
```

---

## 5. 消息幂等性

```javascript
// 用 Redis Set 实现幂等去重
class IdempotentConsumer {
  constructor(redis, ttl = 3600) {
    this.redis = redis;
    this.ttl = ttl;
  }

  async isProcessed(eventId) {
    const key = `processed:${eventId}`;
    const result = await this.redis.set(key, '1', 'EX', this.ttl, 'NX');
    return result === null; // null = key 已存在 = 已处理
  }
}

// 消费者中使用
async function handleOrderCreated(event) {
  if (await idempotentConsumer.isProcessed(event.id)) {
    return console.log(`Event ${event.id} already processed, skipping`);
  }
  await processOrder(event.payload);
}
```

---

## 6. 实践 Checklist

- [ ] 实现 EventBus，发布/订阅多个事件类型
- [ ] 添加日志中间件，记录所有事件
- [ ] 实现幂等性消费（防止重复处理）
- [ ] 用 Saga 模式实现订单+库存+支付的分布式事务
