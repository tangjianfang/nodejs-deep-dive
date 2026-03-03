# 🔮 Promise 深入：从规范到实现

> 目标：回答——**Promise 链式调用的背后，究竟发生了什么？微任务为什么比宏任务先执行？**

---

## 目录

1. Promise 是什么（状态机视角）
2. Promise/A+ 规范精读
3. 微任务 vs 宏任务的调度优先级
4. Promise 静态方法对比（all/allSettled/any/race）
5. 手写 MyPromise 核心逻辑
6. 常见陷阱与反模式
7. Checklist（自检清单）

---

## 1. Promise 是什么（状态机视角）

Promise 本质是一个**三状态有限状态机**：

```
pending ──resolve──▶ fulfilled
pending ──reject───▶ rejected
```

关键约束：
- 状态只能从 `pending` 转移，**不可逆**
- 一旦转移（settled），`.then()` 的回调**异步执行**（进入微任务队列）

```js
const p = new Promise((resolve) => {
  console.log('1: executor 同步执行');
  resolve('done');
  console.log('2: resolve 后继续执行（不会中断）');
});

p.then((val) => console.log('4: then 回调是微任务'));
console.log('3: 同步代码继续');

// 输出顺序：1 → 2 → 3 → 4
```

---

## 2. Promise/A+ 规范精读

> 核心：规范定义了`.then()` 如何工作，而不是整个 Promise 实现。

### 2.1 术语

| 术语 | 含义 |
|------|------|
| `promise` | 有 `.then()` 方法的对象或函数 |
| `thenable` | 有 `.then` 属性的对象或函数 |
| `value` | 任意合法 JS 值（包括 undefined、thenable、promise）|
| `reason` | reject 的原因，任意 JS 值 |

### 2.2 `.then()` 的核心规则

```js
promise.then(onFulfilled, onRejected)
```

1. **`onFulfilled` 和 `onRejected` 都是可选参数**，如果不是函数则忽略
2. `onFulfilled` 在 promise fulfilled 后调用，参数为 `value`
3. `onRejected` 在 promise rejected 后调用，参数为 `reason`
4. **两者只能被调用一次**
5. **两者必须异步调用**（在当前事件循环的"之后"）
6. `.then()` 返回一个**新的 promise**（这是链式调用的关键）

### 2.3 Promise 解决过程（Resolution Procedure）

这是规范中最复杂的部分 `[[Resolve]](promise, x)`：

```
如果 x 是 promise：
  - 如果 x 是 pending → promise 保持 pending 直到 x fulfilled/rejected
  - 如果 x 是 fulfilled → 用相同的 value fulfill promise
  - 如果 x 是 rejected → 用相同的 reason reject promise

如果 x 是 thenable（有 .then 方法）：
  - 调用 x.then(resolvePromise, rejectPromise)

否则：
  - 用 x 直接 fulfill promise
```

---

## 3. 微任务 vs 宏任务

### 调度优先级（高 → 低）

```
同步代码（Call Stack）
    ↓
微任务队列（Microtask Queue）
  - Promise.then / catch / finally
  - queueMicrotask()
  - process.nextTick（Node.js，优先级更高）
    ↓
宏任务队列（Macrotask Queue / Task Queue）
  - setTimeout / setInterval
  - setImmediate（Node.js，在 check 阶段）
  - I/O 回调
```

> **关键**：每次执行一个宏任务之后，会把微任务队列清空到底，然后才执行下一个宏任务。

### 经典题

```js
console.log('1');
setTimeout(() => console.log('2'), 0);
Promise.resolve().then(() => console.log('3'));
process.nextTick(() => console.log('4'));
console.log('5');

// 输出：1 → 5 → 4 → 3 → 2
// 原因：
// 同步：1, 5
// nextTick 队列（高优先级微任务）：4
// Promise 微任务：3
// setTimeout 宏任务：2
```

---

## 4. Promise 静态方法对比

| 方法 | 语义 | 失败行为 | 典型场景 |
|------|------|----------|----------|
| `Promise.all([...])` | 全部成功 | 任一失败立即 reject | 并行 API 调用，全部成功才继续 |
| `Promise.allSettled([...])` | 等全部完成 | 不 reject，返回状态数组 | 批量操作，需知道每个结果 |
| `Promise.race([...])` | 返回最快的 | 最快的 reject 就 reject | 超时控制（race with timeout） |
| `Promise.any([...])` | 成功一个即可 | 全部失败才 reject（AggregateError）| 多源请求，取最快成功的 |

```js
// 超时控制示例（Promise.race）
function withTimeout(promise, ms) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
  );
  return Promise.race([promise, timeout]);
}

// 批量操作，容忍失败（Promise.allSettled）
const results = await Promise.allSettled([
  fetch('/api/user/1'),
  fetch('/api/user/2'),
  fetch('/api/user/3'),
]);

results.forEach(({ status, value, reason }) => {
  if (status === 'fulfilled') console.log('成功:', value);
  else console.log('失败:', reason);
});
```

---

## 5. 手写 MyPromise 核心逻辑

> 完整实现见 `scripts/demo-my-promise.js`

### 核心骨架

```js
const STATE = { PENDING: 'pending', FULFILLED: 'fulfilled', REJECTED: 'rejected' };

class MyPromise {
  #state = STATE.PENDING;
  #value = undefined;
  #handlers = [];  // { onFulfilled, onRejected, resolve, reject }

  constructor(executor) {
    try {
      executor(
        (value) => this.#resolve(value),
        (reason) => this.#reject(reason)
      );
    } catch (e) {
      this.#reject(e);
    }
  }

  #resolve(value) {
    if (this.#state !== STATE.PENDING) return;
    // 如果 value 是 thenable，递归处理
    if (value instanceof MyPromise) {
      value.then(
        (v) => this.#resolve(v),
        (r) => this.#reject(r)
      );
      return;
    }
    this.#state = STATE.FULFILLED;
    this.#value = value;
    this.#runHandlers();
  }

  #reject(reason) {
    if (this.#state !== STATE.PENDING) return;
    this.#state = STATE.REJECTED;
    this.#value = reason;
    this.#runHandlers();
  }

  #runHandlers() {
    this.#handlers.forEach(this.#runHandler.bind(this));
    this.#handlers = [];
  }

  #runHandler({ onFulfilled, onRejected, resolve, reject }) {
    queueMicrotask(() => {
      const handler = this.#state === STATE.FULFILLED ? onFulfilled : onRejected;
      if (typeof handler !== 'function') {
        // 值穿透
        this.#state === STATE.FULFILLED ? resolve(this.#value) : reject(this.#value);
        return;
      }
      try {
        resolve(handler(this.#value));
      } catch (e) {
        reject(e);
      }
    });
  }

  then(onFulfilled, onRejected) {
    return new MyPromise((resolve, reject) => {
      this.#handlers.push({ onFulfilled, onRejected, resolve, reject });
      if (this.#state !== STATE.PENDING) this.#runHandlers();
    });
  }

  catch(onRejected) { return this.then(undefined, onRejected); }
  finally(onFinally) {
    return this.then(
      (v) => MyPromise.resolve(onFinally()).then(() => v),
      (r) => MyPromise.resolve(onFinally()).then(() => { throw r; })
    );
  }

  static resolve(value) {
    if (value instanceof MyPromise) return value;
    return new MyPromise((resolve) => resolve(value));
  }
  static reject(reason) { return new MyPromise((_, reject) => reject(reason)); }
}
```

---

## 6. 常见陷阱与反模式

### 陷阱 1：Promise 吞错（忘记 catch）

```js
// ❌ 危险：rejection 无声无息
async function fetchData() {
  const res = await fetch('/api/data'); // 如果 reject，调用方不知道
  return res.json();
}

// ✅ 正确：调用方处理错误
fetchData().catch(console.error);
// 或全局兜底
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  process.exit(1); // Node.js v15+ 已默认如此
});
```

### 陷阱 2：Promise 构造器反模式（Promisify Deferred Anti-pattern）

```js
// ❌ 不必要的 Promise 包装
function delay(ms) {
  return new Promise((resolve) => {
    return Promise.resolve().then(() => setTimeout(resolve, ms)); // 多余
  });
}

// ✅ 直接
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

### 陷阱 3：并发爆炸

```js
// ❌ 同时发起 10000 个请求
const results = await Promise.all(urls.map(fetch));

// ✅ 使用并发控制器（见 concurrency-control.md）
import pLimit from 'p-limit';
const limit = pLimit(10);
const results = await Promise.all(urls.map((url) => limit(() => fetch(url))));
```

### 陷阱 4：在循环中 await（本来想串行，却写错了）

```js
// ❌ 看起来并行，实际串行（forEach 不等待 async）
arr.forEach(async (item) => {
  await process(item); // forEach 不会等待这个
});

// ✅ 串行
for (const item of arr) {
  await process(item);
}

// ✅ 真正并行
await Promise.all(arr.map((item) => process(item)));
```

---

## 7. Checklist（自检清单）

- [ ] 能从状态机角度解释 Promise 的 3 种状态和转移规则
- [ ] 知道 `.then()` 返回新 Promise 的原因（链式调用）
- [ ] 能准确预测含 nextTick、Promise、setTimeout 的混合代码输出
- [ ] 了解 `Promise.all` vs `Promise.allSettled` 的失败语义区别
- [ ] 手写 MyPromise 通过 5 个核心测试用例（状态不可变、值穿透、异步 then、链式调用、错误捕获）
