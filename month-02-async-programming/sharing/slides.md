````markdown
# 🎤 从回调地狱到优雅异步 — Node.js 异步编程演化史与最佳实践

> 分享人：XXX | 日期：2025-03-XX | 时长：45min
> 🗣️ **演讲者备注**：适合所有 Node.js 开发者，中级以上效果最佳

---

## 开场（2min）

### 一道热身题

> 下面这段代码输出什么？

```js
console.log('1');
setTimeout(() => console.log('2'), 0);
Promise.resolve().then(() => console.log('3'));
process.nextTick(() => console.log('4'));
console.log('5');
```

🗣️ **让大家思考 10 秒，再举手投票：**
- A: `1 5 2 3 4`
- B: `1 5 4 3 2`
- C: `1 5 3 4 2`
- D: `1 5 4 2 3`

**正确答案：B（1 → 5 → 4 → 3 → 2）**

今天结束后，你会完全理解为什么。

---

## Part 1：异步演化时间线（10min）

---

### 阶段一：回调地狱（2010-2015）

```js
// 读文件 → 解析用户 ID → 查数据库 → 返回结果
fs.readFile('user.txt', (err, data) => {
  if (err) return handleError(err);
  const userId = parseUserId(data);
  db.query('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
    if (err) return handleError(err);
    db.query('SELECT * FROM orders WHERE userId = ?', [userId], (err, orders) => {
      if (err) return handleError(err);
      // ... 嵌套越来越深
    });
  });
});
```

**问题**：
- 错误处理分散（每层都要判断 err）
- 代码"向右漂移"，可读性差
- 控制流复杂（条件分支、循环更难写）

---

### 阶段二：Promise（2015-2017）

```js
// 同样的逻辑，Promise 版本
readFileAsync('user.txt')
  .then((data) => parseUserId(data))
  .then((userId) => db.queryAsync('SELECT * FROM users WHERE id = ?', [userId]))
  .then((user) => db.queryAsync('SELECT * FROM orders WHERE userId = ?', [user.id]))
  .then((orders) => console.log(orders))
  .catch((err) => handleError(err)); // 统一错误处理
```

**改进**：统一的错误处理，链式调用更线性

**遗留问题**：`.then` 链仍然不够直观，中间变量传递麻烦

---

### 阶段三：async/await（2017-至今）

```js
// async/await 版本，读起来像同步代码
async function getUserWithOrders() {
  try {
    const data = await readFileAsync('user.txt');
    const userId = parseUserId(data);
    const user = await db.queryAsync('SELECT * FROM users WHERE id = ?', [userId]);
    const orders = await db.queryAsync('SELECT * FROM orders WHERE userId = ?', [user.id]);
    return { user, orders };
  } catch (err) {
    handleError(err);
  }
}
```

🗣️ **互动**：哪个版本最容易读？（举手）

---

## Part 2：现场 Code Review — 找出 3 种反模式（10min）

🗣️ **演示：打开真实项目代码（或准备好的 Bad Practices 代码）**

---

### 反模式 1：忘记 await

```js
// ❌ 问题：没有 await，错误无声无息丢失
async function saveUser(user) {
  validateUser(user); // 假设这是个 async validation
  db.save(user);      // 没有 await！
  return 'saved';     // 立即返回，但保存可能还没完成
}

// ✅ 修复
async function saveUser(user) {
  await validateUser(user);
  await db.save(user);
  return 'saved';
}
```

---

### 反模式 2：Promise 吞错

```js
// ❌ 问题：rejection 丢失
function loadConfig() {
  fetch('/api/config')
    .then((r) => r.json())
    .then((config) => applyConfig(config));
  // 没有 .catch！
}

// ✅ 修复
async function loadConfig() {
  try {
    const config = await fetch('/api/config').then((r) => r.json());
    applyConfig(config);
  } catch (e) {
    logger.error('Failed to load config:', e);
    // 决定：是否使用默认配置？是否重新抛出？
  }
}
```

---

### 反模式 3：并发爆炸

```js
// ❌ 问题：同时发起 10000 个 API 请求
const users = await db.findAllUsers(); // 假设有 10000 个
const results = await Promise.all(
  users.map((u) => sendEmail(u.email)) // 10000 个并发请求！
);

// ✅ 修复：使用并发控制器
const limit = createLimit(10); // 最多 10 个并发
const results = await Promise.all(
  users.map((u) => limit(() => sendEmail(u.email)))
);
```

🗣️ **现场演示 demo-concurrent-limiter.js：观察有限流 vs 无限流的活跃数差异**

---

## Part 3：AsyncLocalStorage 的魔法（8min）

🗣️ **演示 demo-async-local-storage.js**

```js
// 问题：如何让 requestId 出现在所有日志中？
// 方案一：每个函数都加参数（繁琐，容易忘）
function queryDB(sql, requestId) { ... }
function userService(userId, requestId) { ... }
function userController(req) {
  return userService(req.params.id, req.headers['x-request-id']);
}

// 方案二：AsyncLocalStorage（优雅）
const requestContext = new AsyncLocalStorage();

// 只在请求入口设一次
requestContext.run({ requestId: req.headers['x-request-id'] }, async () => {
  await userService(req.params.id); // 内部自动有 requestId
});

// 任意层级获取
function queryDB(sql) {
  const { requestId } = requestContext.getStore();
  log.info({ requestId, sql }, 'DB query');
}
```

**现场演示效果**：并发 3 个请求，每条日志都携带正确的 requestId，没有混淆

---

## Part 4：并发控制器实现原理（8min）

### 核心逻辑（30行代码）

```js
function createLimit(maxConcurrent) {
  let active = 0;
  const queue = [];

  return function limit(fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
  };

  function next() {
    if (active >= maxConcurrent || queue.length === 0) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    Promise.resolve(fn())
      .then(resolve, reject)
      .finally(() => { active--; next(); });
  }
}
```

🗣️ **画图解释**：任务队列 + active 计数器的工作原理

---

## 总结与 Q&A（7min）

### 今天的核心收获

| 概念 | 关键点 |
|------|--------|
| 微任务优先级 | nextTick > Promise > setTimeout |
| async/await 本质 | Generator + Promise + 自动执行器 |
| 并发控制 | 队列 + active 计数，`finally` 触发 next |
| AsyncLocalStorage | `.run()` 建立上下文，`.getStore()` 任意获取 |

### 行动建议

1. **本周**：检查项目中是否有未处理的 Promise rejection
2. **本月**：引入 AsyncLocalStorage 解决 requestId 传递问题
3. **下次 Code Review**：关注 `forEach(async)` 陷阱和并发爆炸

---

## 附录：热身题答案解析

```
1 → 5 → 4 → 3 → 2

同步代码：1, 5
nextTick 队列（特殊微任务，每轮最优先）：4
Promise 微任务（标准微任务队列）：3
setTimeout 宏任务（check 阶段之后，或下一个 timers 轮次）：2
```

🗣️ **说明 process.nextTick 在 Node.js 里为什么比 Promise 优先**：
nextTick 的回调在当前操作完成后、在 libuv 继续检查其他任务之前执行，相当于"插队"。
````
