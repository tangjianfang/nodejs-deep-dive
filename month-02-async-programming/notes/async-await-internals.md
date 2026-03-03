# ⚙️ async/await 底层原理：Generator + 自动执行器

> 目标：**async/await 不是魔法，它是 Generator + Promise 的语法糖。**

---

## 目录

1. Generator 函数与协程
2. `co` 库的自动执行器原理
3. Babel 编译 async/await 的产物分析
4. await 的执行时机与微任务
5. 顶层 await（Top-level await）
6. 错误处理：try/catch 与 async 的边界
7. Checklist

---

## 1. Generator 函数与协程

Generator 是 JavaScript 中**协程**（coroutine）的实现，可以暂停和恢复执行：

```js
function* gen() {
  console.log('step 1');
  const x = yield 'pause here';  // 暂停，返回 'pause here'
  console.log('step 2, got:', x);
  return 'done';
}

const g = gen();
console.log(g.next());       // { value: 'pause here', done: false }  → 打印 "step 1"
console.log(g.next('hello'));// { value: 'done', done: true }          → 打印 "step 2, got: hello"
```

**关键**：
- `yield` 暂停执行，**将值传出去**
- `.next(value)` 恢复执行，**将值传进去**（替换 yield 表达式的返回值）

---

## 2. `co` 库：手动变自动的关键

如果每个 `yield` 后面都是 Promise，我们可以**自动**等待 Promise，然后把结果送回去：

```js
// 手动版本（繁琐）
function* fetchUser() {
  const user = yield fetch('/api/user').then(r => r.json());
  const posts = yield fetch(`/api/posts/${user.id}`).then(r => r.json());
  return { user, posts };
}

const g = fetchUser();
g.next().value.then((user) => {
  g.next(user).value.then((posts) => {
    g.next(posts); // 最终结果
  });
});
```

```js
// 自动版本（co 库原理）
function run(generatorFn) {
  return new Promise((resolve, reject) => {
    const gen = generatorFn();

    function step(nextFn) {
      let result;
      try {
        result = nextFn();
      } catch (e) {
        return reject(e);
      }

      if (result.done) return resolve(result.value);

      // 等待 yield 出来的 Promise
      Promise.resolve(result.value).then(
        (val) => step(() => gen.next(val)),     // 成功：把值送回去
        (err) => step(() => gen.throw(err))    // 失败：在 yield 处抛错
      );
    }

    step(() => gen.next(undefined));
  });
}

// 用法
run(fetchUser).then(({ user, posts }) => console.log(user, posts));
```

> **这就是 async/await 的本质**：JavaScript 引擎内置了这个"自动执行器"。

---

## 3. Babel 编译 async/await 的产物

**源代码**：
```js
async function fetchUser(id) {
  const user = await db.findUser(id);
  const posts = await db.findPosts(user.id);
  return { user, posts };
}
```

**Babel 编译后（简化版）**：
```js
function fetchUser(id) {
  return _asyncToGenerator(function* () {
    const user = yield db.findUser(id);
    const posts = yield db.findPosts(user.id);
    return { user, posts };
  })();
}

function _asyncToGenerator(fn) {
  return function () {
    const gen = fn.apply(this, arguments);
    return new Promise((resolve, reject) => {
      function step(key, arg) {
        let result;
        try { result = gen[key](arg); } catch (e) { return reject(e); }
        if (result.done) return resolve(result.value);
        return Promise.resolve(result.value).then(
          (val) => step('next', val),
          (err) => step('throw', err)
        );
      }
      step('next');
    });
  };
}
```

**关键洞察**：
1. `async function` → 普通函数，返回 `new Promise`
2. `await expr` → `yield expr`（暂停）
3. 自动执行器负责：`Promise.resolve(yield值).then(后续执行)`

---

## 4. await 的执行时机

`await` 会把后续代码包装成微任务：

```js
async function demo() {
  console.log('A');           // 同步
  await Promise.resolve();    // 暂停，后续进入微任务
  console.log('C');           // 微任务（换行后第一个tick）
}

console.log('before');
demo();
console.log('B');

// 输出：before → A → B → C
```

**`await` 非 Promise 值的处理**：

```js
// await 非 Promise 值会被包装为 Promise.resolve(value)
async function test() {
  const x = await 42;    // 等价于 await Promise.resolve(42)
  console.log(x);        // 42
}
```

**重要**：即使 await 的是一个已经 resolved 的 Promise，后续代码也是**异步的**（微任务）。

---

## 5. 顶层 await（Top-level await）

Node.js v20+ / ESM 模块支持顶层 await：

```js
// config.mjs（ESM 模块）
const config = await fetch('/api/config').then(r => r.json());
export default config;

// main.mjs
import config from './config.mjs'; // 会等待 config.mjs 完全加载（包括 await）
console.log(config);
```

**注意**：顶层 await 会**阻塞模块的导入者**直到模块加载完成。

```js
// 常见用法：数据库初始化
// db.mjs
import { createPool } from 'pg';
export const pool = await new Promise((resolve) => {
  const p = createPool({ connectionString: process.env.DATABASE_URL });
  p.connect().then(() => resolve(p));
});
```

---

## 6. 错误处理边界

### async 函数的错误不会自动传播（不 await 的话）

```js
// ❌ 这个错误会变成 unhandledRejection
async function riskyOp() {
  throw new Error('boom');
}

function caller() {
  riskyOp(); // 不 await！错误丢失
  return 'ok';
}
```

```js
// ✅ 方案1：await + try/catch
async function caller() {
  try {
    await riskyOp();
  } catch (e) {
    console.error('caught:', e);
  }
}

// ✅ 方案2：.catch()
async function caller() {
  riskyOp().catch(console.error);
}
```

### try/catch 的范围

```js
async function example() {
  try {
    const a = await stepA();  // 如果 stepA reject，跳到 catch
    const b = await stepB(a); // 如果 stepB reject，跳到 catch
    return b;
  } catch (e) {
    // 两个 await 的错误都在这里
    // 但无法区分是哪步失败
  }
}

// 需要区分时，分开处理
async function example() {
  const a = await stepA().catch((e) => { handle(e); return null; });
  if (!a) return;
  return stepB(a);
}
```

---

## 7. Checklist

- [ ] 能用"Generator + 自动执行器"解释 async/await 的工作原理
- [ ] 理解 Babel 编译后的产物结构（`_asyncToGenerator`）
- [ ] 知道 `await` 后的代码是微任务，能预测含 async/await 的代码输出顺序
- [ ] 理解顶层 await 的模块加载阻塞行为
- [ ] 能说出 try/catch 在 async 函数中的作用范围
