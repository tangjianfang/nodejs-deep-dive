# 🚦 并发控制模式

> 目标：**在 Node.js 中，如何安全地"多任务并发"而不搞垮系统？**

---

## 目录

1. 四种并发模式速览
2. 串行执行 — 最简单的"不并发"
3. 并行执行 — 全速并跑的陷阱
4. 限流并发 — p-limit 原理实现
5. 批处理 — p-map 的分批策略
6. 优先级队列 — p-queue 实现
7. AbortController — 取消长时间运行的异步
8. AsyncLocalStorage — 异步上下文追踪
9. Checklist

---

## 1. 四种并发模式速览

| 模式 | API | 特点 | 适用场景 |
|------|-----|------|----------|
| 串行 | `for...of` + `await` | 按顺序，慢但安全 | 有副作用的操作、数据库写入 |
| 全并行 | `Promise.all` | 全速，可能打爆资源 | 无关联的读操作，数量可控 |
| 限流 | `p-limit` | 同时最多 N 个 | API 调用、数据库连接池 |
| 优先级队列 | `p-queue` | 有序、可暂停 | 任务调度、后台工作 |

---

## 2. 串行执行

```js
// for...of + await = 串行（前一个完成才运行下一个）
async function processItems(items) {
  for (const item of items) {
    await process(item); // 必须等
  }
}

// ⚠️ 陷阱：forEach 不会等待 async
items.forEach(async (item) => {
  await process(item); // forEach 不关心这个 Promise！
});
// 上面的 await 没有意义，所有任务实际上是"同时启动的"

// 同样的陷阱：.map() + forEach
const promises = items.map(async (item) => {
  // 这里是并行的（见下面并行执行）
  return await process(item);
});
await Promise.all(promises); // 正确收集结果
```

**串行的性能代价**：
- 10 个任务，每个 100ms → 串行需要 1000ms
- 全并行需要 ≈100ms
- 限流 3 并发需要 ≈400ms

---

## 3. 全并行 & 陷阱

```js
// ✅ 正确并行
const results = await Promise.all(items.map((item) => process(item)));

// ❌ 如果 items 有 10000 条？同时发 10000 个网络请求
// → 数据库连接池耗尽、目标 API 被 DDoS、内存溢出
```

---

## 4. 限流并发（p-limit 原理）

```js
// 自实现限流 - 核心原理
function createLimit(concurrency) {
  let active = 0;
  const queue = [];

  return function limit(fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
  };

  function next() {
    if (active >= concurrency || queue.length === 0) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    Promise.resolve(fn())
      .then(resolve, reject)
      .finally(() => {
        active--;
        next(); // 完成一个，再取下一个
      });
  }
}

// 使用
const limit = createLimit(3); // 最多 3 个并发

const results = await Promise.all(
  urls.map((url) => limit(() => fetch(url).then(r => r.json())))
);
```

> 完整实现见 `scripts/demo-concurrent-limiter.js`

---

## 5. AbortController — 取消异步操作

```js
// 创建可取消的请求
const controller = new AbortController();
const { signal } = controller;

// 5秒超时
const timeoutId = setTimeout(() => controller.abort(new Error('timeout')), 5000);

try {
  const response = await fetch('/api/slow-endpoint', { signal });
  clearTimeout(timeoutId);
  return await response.json();
} catch (e) {
  if (e.name === 'AbortError') {
    console.log('Request was aborted');
  } else {
    throw e;
  }
}

// 手动取消
controller.abort();
```

**取消 setTimeout / setInterval**：
```js
function createCancellableDelay(ms) {
  const controller = new AbortController();
  const promise = new Promise((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    controller.signal.addEventListener('abort', () => {
      clearTimeout(id);
      reject(controller.signal.reason ?? new Error('aborted'));
    });
  });
  return { promise, abort: () => controller.abort() };
}
```

---

## 6. AsyncLocalStorage — 异步上下文

```js
import { AsyncLocalStorage } from 'node:async_hooks';

const requestStore = new AsyncLocalStorage();

// 中间件：在请求开始时建立上下文
function requestMiddleware(req, res, next) {
  const store = { requestId: crypto.randomUUID(), startTime: Date.now() };
  // run() 中的所有异步代码都能访问这个 store
  requestStore.run(store, next);
}

// 任意深度的调用都能获取 requestId，无需传参
function logQuery(sql) {
  const store = requestStore.getStore();
  console.log(`[${store?.requestId ?? 'no-context'}] Query: ${sql}`);
}

async function userService(userId) {
  logQuery(`SELECT * FROM users WHERE id = ${userId}`);
  // ...
}

// Express 使用示例
app.use(requestMiddleware);
app.get('/users/:id', async (req, res) => {
  // requestId 可从 AsyncLocalStorage 获取，不需要显式传入
  const user = await userService(req.params.id); // logQuery 能访问到 requestId
  res.json(user);
});
```

> 完整链路追踪实现见 `scripts/demo-async-local-storage.js`

---

## 7. 指数退避重试

```js
async function withRetry(fn, { maxAttempts = 3, baseDelay = 300, jitter = true } = {}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt === maxAttempts) throw e;

      const delay = baseDelay * Math.pow(2, attempt - 1); // 指数退避
      const actualDelay = jitter
        ? delay + Math.random() * delay * 0.3  // 加抖动，避免惊群
        : delay;

      console.log(`Attempt ${attempt} failed, retrying in ${actualDelay}ms...`);
      await new Promise((r) => setTimeout(r, actualDelay));
    }
  }
}

// 使用
const data = await withRetry(
  () => fetch('/api/unstable-endpoint').then(r => r.json()),
  { maxAttempts: 5, baseDelay: 500 }
);
```

---

## 8. Checklist

- [ ] 区分 `Promise.all` vs 串行 `for await...of` 的性能与安全性权衡
- [ ] 能手写一个 `createLimit(n)` 函数（基于队列 + active 计数器）
- [ ] 理解 `AsyncLocalStorage.run()` 创建异步上下文的机制
- [ ] 能实现带 jitter 的指数退避重试函数
- [ ] 知道 `forEach(async)` 的陷阱以及正确的替代方式
