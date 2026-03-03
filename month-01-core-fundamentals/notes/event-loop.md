# 🔄 深入理解 Node.js Event Loop

> 目标：搞清楚——**异步代码的执行顺序到底由谁决定？为什么 setTimeout 和 setImmediate 的顺序"不确定"？**

---

## 目录

1. Event Loop 是什么（一句话版）
2. V8 与 libuv 的分工
3. Event Loop 六阶段详解
4. 微任务：nextTick 与 Promise
5. 经典输出顺序题（含分析）
6. 工程启示
7. Checklist（自检清单）

---

## 1. Event Loop 是什么

> Event Loop = **一个不断循环的调度器**，决定"哪些回调现在执行、哪些等下一轮"。

Node.js 是单线程执行 JS，但 I/O 操作（文件读写、网络请求等）交给操作系统或线程池。
Event Loop 的职责是：**当 I/O 完成后，把对应的回调"排进队列"，然后按顺序执行。**

类比：你是一个厨师（单线程），同时下了三个外卖单（异步 I/O）。
Event Loop 就是你旁边的叫号器——哪个单子好了就喊你处理。

---

## 2. V8 与 libuv 的分工

```text
┌──────────────────────────┐
│       你的 JS 代码        │
├──────────────────────────┤
│          V8              │  ← 执行 JS、管理堆栈、GC
├──────────────────────────┤
│         libuv            │  ← 事件循环、异步 I/O、线程池
├──────────────────────────┤
│       操作系统            │  ← epoll/kqueue/IOCP
└──────────────────────────┘
```

- **V8**：只负责"执行 JS 代码"，不管 I/O。
- **libuv**：负责事件循环调度、把 I/O 结果变成回调传回给 V8 执行。

---

## 3. Event Loop 六阶段详解

每次循环（称为一个 tick）按以下顺序执行：

```text
   ┌───────────────────────────┐
┌─>│       1. timers            │  setTimeout / setInterval 回调
│  └──────────┬────────────────┘
│  ┌──────────▼────────────────┐
│  │    2. pending callbacks    │  系统级回调（TCP 错误等）
│  └──────────┬────────────────┘
│  ┌──────────▼────────────────┐
│  │      3. idle/prepare       │  内部使用，可忽略
│  └──────────┬────────────────┘
│  ┌──────────▼────────────────┐
│  │        4. poll             │  检索新 I/O 事件；执行 I/O 回调
│  └──────────┬────────────────┘
│  ┌──────────▼────────────────┐
│  │        5. check            │  setImmediate 回调
│  └──────────┬────────────────┘
│  ┌──────────▼────────────────┐
│  │    6. close callbacks      │  socket.on('close') 等
│  └──────────┬────────────────┘
└─────────────┘
```

### 3.1 timers 阶段

执行 `setTimeout` 和 `setInterval` 到期的回调。

注意：timer 的延迟是**最小延迟**，不是精确延迟。如果 poll 阶段耗时较长，timer 回调会被推迟。

### 3.2 pending callbacks 阶段

执行被推迟到下一轮循环的系统级回调，如 TCP 连接错误。日常开发中很少直接接触。

### 3.3 idle / prepare 阶段

libuv 内部使用，开发者无需关心。

### 3.4 poll 阶段（最关键）

这是事件循环**停留时间最长**的阶段，主要做两件事：

1. **计算应该阻塞多久**（等待 I/O）
2. **执行 I/O 回调**（如文件读取完成、网络数据到达）

关键行为：
- 如果 poll 队列不为空 → 依次执行回调
- 如果 poll 队列为空：
  - 有 `setImmediate` → 进入 check 阶段
  - 没有 `setImmediate` → 等待新 I/O 事件（但不会无限等，受 timers 限制）

### 3.5 check 阶段

专门执行 `setImmediate()` 回调。它总在 poll 阶段完成后立即执行。

### 3.6 close callbacks 阶段

处理 `socket.on('close', ...)` 等关闭事件。

---

## 4. 微任务：nextTick 与 Promise

微任务**不属于六阶段中的任何一个**，而是在**每个阶段切换之间**执行。

执行优先级：

```text
当前阶段的回调全部执行完
  ↓
process.nextTick 队列（全部清空）
  ↓
Promise 微任务队列（全部清空）
  ↓
进入下一阶段
```

### nextTick vs Promise

| 特性 | process.nextTick | Promise.then |
|------|-----------------|--------------|
| 执行时机 | 当前阶段结束后、微任务之前 | nextTick 之后 |
| 优先级 | 更高 | 略低 |
| 递归风险 | 高（可能饿死 I/O） | 低 |

```js
// nextTick 优先于 Promise
process.nextTick(() => console.log('nextTick'));
Promise.resolve().then(() => console.log('promise'));
// 输出：nextTick → promise
```

### ⚠️ nextTick 递归陷阱

```js
// 危险！会饿死 I/O，Event Loop 无法推进
function bad() {
  process.nextTick(bad);
}
bad();

// 安全替代：用 setImmediate
function good() {
  setImmediate(good); // 每轮循环执行一次，不阻塞 I/O
}
```

---

## 5. 经典输出顺序题

### 题目 1：基础顺序

```js
console.log('1');
setTimeout(() => console.log('2'), 0);
setImmediate(() => console.log('3'));
process.nextTick(() => console.log('4'));
Promise.resolve().then(() => console.log('5'));
console.log('6');
```

**答案：`1 → 6 → 4 → 5 → 2 → 3`**（2 和 3 顺序在主模块中不确定）

分析：
1. 同步代码先执行 → `1`, `6`
2. 微任务：nextTick 优先 → `4`，再 Promise → `5`
3. timer 阶段 → `2`
4. check 阶段 → `3`

> 注意：在**主模块**中 `setTimeout(fn, 0)` 和 `setImmediate` 顺序不确定（取决于进程启动耗时）。但**在 I/O 回调内部**，`setImmediate` 一定先于 `setTimeout`。

### 题目 2：I/O 回调内部

```js
const fs = require('fs');

fs.readFile(__filename, () => {
  setTimeout(() => console.log('timeout'), 0);
  setImmediate(() => console.log('immediate'));
});
```

**答案：一定是 `immediate → timeout`**

因为 I/O 回调在 poll 阶段执行，执行完后下一个阶段是 check（setImmediate），然后才回到 timers。

### 题目 3：nextTick 嵌套

```js
process.nextTick(() => {
  console.log('tick1');
  process.nextTick(() => console.log('tick2'));
});
setTimeout(() => console.log('timeout'), 0);
```

**答案：`tick1 → tick2 → timeout`**

nextTick 队列会**完全清空**后才进入下一阶段，所以嵌套的 nextTick 也会在 timer 之前执行。

---

## 6. 工程启示

### 该用 setImmediate 还是 setTimeout(fn, 0)？

- 在 I/O 回调中想"尽快执行" → **setImmediate**（语义明确、顺序确定）
- 需要延迟指定时间 → **setTimeout**
- 需要在当前阶段结束后立即插入逻辑 → **process.nextTick**（谨慎使用）

### 避免阻塞 Event Loop

```js
// ❌ 同步密集计算阻塞主线程
function bad() {
  const start = Date.now();
  while (Date.now() - start < 5000) {} // 阻塞 5 秒
}

// ✅ 拆分成小块，让 Event Loop 有机会处理 I/O
function processChunk(data, index, callback) {
  // 处理一小块
  const chunk = data.slice(index, index + 1000);
  // ... 处理逻辑
  if (index + 1000 < data.length) {
    setImmediate(() => processChunk(data, index + 1000, callback));
  } else {
    callback();
  }
}
```

### 核心原则

> **不要阻塞 Event Loop，不要饿死 I/O。**
> 密集计算拆小块或用 Worker Threads；nextTick 不要递归。

---

## 7. Checklist（自检清单）

- [ ] 能画出 Event Loop 六阶段的顺序？
- [ ] 知道 poll 阶段的特殊行为（阻塞等待）？
- [ ] 能区分 setTimeout vs setImmediate 在不同上下文中的顺序？
- [ ] 知道 nextTick 和 Promise 的优先级关系？
- [ ] 知道 nextTick 递归的风险？
- [ ] 能解释"在 I/O 回调中 setImmediate 一定先于 setTimeout"？
- [ ] 知道如何拆分 CPU 密集任务避免阻塞 Event Loop？

---
