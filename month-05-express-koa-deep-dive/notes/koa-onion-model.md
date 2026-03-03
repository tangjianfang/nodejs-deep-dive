# Koa 洋葱模型深度解析

## 1. Koa 设计哲学

Koa 由 Express 原班人马开发，核心理念：

- **极简内核**：Koa 本身只有 ~550 行代码
- **async/await 原生支持**：中间件是 async 函数，天然支持异步
- **洋葱模型**：中间件可以在请求前后都执行逻辑（vs Express 单向链条）
- **ctx 对象**：将 req 和 res 合并为一个 context 对象

---

## 2. 洋葱模型 vs Express 直线模型

### Express 直线模型
```
request
  │
  ▼
[mw1 - enter]
  │ next()
  ▼
[mw2 - enter]
  │ next()
  ▼
[handler - sends response]
  │
  (mw1, mw2 的后续代码不再执行，除非用特殊技巧)
```

### Koa 洋葱模型
```
request
  │
  ▼
┌─[mw1 before]─────────────────────────┐
│   │ await next()                      │
│   ▼                                   │
│  ┌─[mw2 before]─────────────────┐    │
│  │   │ await next()               │    │
│  │   ▼                            │    │
│  │  ┌─[mw3 / route handler]─┐    │    │
│  │  │    res.body = data     │    │    │
│  │  └───────────────────────┘    │    │
│  │   ▲ (返回到 mw2)               │    │
│  │  [mw2 after]                  │    │
│  └───────────────────────────────┘    │
│   ▲ (返回到 mw1)                       │
│  [mw1 after]                          │
└───────────────────────────────────────┘
  │
  ▼
response
```

### 实测对比
```javascript
// Express（直线）
app.use((req, res, next) => {
  console.log('1 →');
  next();
  console.log('1 ←'); // 会执行，但 response 可能已发送！
});
app.use((req, res, next) => {
  console.log('2 →');
  res.send('done'); // 发送响应
});
// 输出: 1 → 2 → 1 ←（注意顺序）

// Koa（洋葱）
app.use(async (ctx, next) => {
  console.log('1 →');
  await next();      // 等待后续中间件完成
  console.log('1 ←'); // 后续完成后才执行
});
app.use(async (ctx, next) => {
  console.log('2 →');
  await next();
  console.log('2 ←');
});
app.use(async (ctx) => {
  console.log('3');
  ctx.body = 'done';
});
// 输出: 1 → 2 → 3 2 ← 1 ←（完美洋葱！）
```

---

## 3. Koa `ctx` 对象

`ctx` 是 Koa Context，封装了 `req` 和 `res`：

```javascript
// ctx 的结构
ctx.request  // Koa Request 对象（对 Node.js req 的封装）
ctx.response // Koa Response 对象（对 Node.js res 的封装）

// 快捷访问（委托模式）
ctx.method   // === ctx.request.method
ctx.url      // === ctx.request.url
ctx.path     // === ctx.request.path
ctx.query    // === ctx.request.query（Object）
ctx.headers  // === ctx.request.headers
ctx.body     // === ctx.response.body（设置响应体）
ctx.status   // === ctx.response.status（设置状态码）
ctx.type     // === ctx.response.type（Content-Type 简写）

// 自定义属性传递（在中间件之间共享数据）
ctx.state.user = { id: 1, name: 'Alice' }; // 约定用 ctx.state

// 其他常用方法
ctx.set('X-Request-Id', '123');  // 设置响应头
ctx.get('Authorization');         // 获取请求头
ctx.redirect('/login');           // 重定向
ctx.throw(401, 'Unauthorized');   // 抛出 HTTP 错误（自动处理）
ctx.assert(user, 401, 'Need login'); // 断言
ctx.cookies.get('token');         // 获取 cookie
ctx.cookies.set('token', val, { httpOnly: true }); // 设置 cookie
```

### 响应体的多种形式
```javascript
ctx.body = 'Hi!';                    // string → text/plain
ctx.body = '<h1>Hi!</h1>';           // Buffer → 需手动设 Content-Type
ctx.body = { name: 'Alice' };        // Object → application/json（自动序列化）
ctx.body = [1, 2, 3];                // Array → application/json
ctx.body = fs.createReadStream(path); // Stream → 流式传输（自动 pipe）
ctx.body = null;                     // 204 No Content
```

---

## 4. koa-compose 源码解析

`koa-compose` 是 Koa 洋葱模型的核心，**仅 37 行代码**！

```javascript
// koa-compose/index.js（核心逻辑）
function compose(middleware) {
  // 返回一个函数，接受 context 和可选的 next
  return function(context, next) {
    let index = -1;
    
    // 从第一个中间件开始
    return dispatch(0);
    
    function dispatch(i) {
      // 防止同一个中间件多次调用 next()
      if (i <= index) return Promise.reject(new Error('next() called multiple times'));
      index = i;
      
      // 获取当前中间件
      let fn = middleware[i];
      
      // 如果没有更多中间件，使用传入的 next（或返回 resolved Promise）
      if (i === middleware.length) fn = next;
      if (!fn) return Promise.resolve();
      
      // 调用中间件，传入 ctx 和包装的 next 函数
      try {
        return Promise.resolve(
          fn(context, function next() {
            return dispatch(i + 1); // 下一个中间件
          })
        );
      } catch (err) {
        return Promise.reject(err);
      }
    }
  };
}
```

### 为什么洋葱模型能工作？
```javascript
// 关键：await next() 等待 dispatch(i+1) 这个 Promise 完成
// dispatch(i+1) 会进一步执行 mw[i+1], mw[i+2], ..., mw[n]
// 所有后续中间件都完成后，await next() 才返回
// 然后当前中间件继续执行 await next() 之后的代码

// await next() = 等待"右边所有洋葱层都执行完"
```

---

## 5. Koa 错误处理

```javascript
// Koa 统一错误处理：监听 'error' 事件
app.on('error', (err, ctx) => {
  console.error('Server Error:', err.message);
  // 发送邮件、上报到 Sentry 等
});

// 全局错误中间件（第一个注册，最外层）
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    // ctx.throw 产生的 HttpError 有 status 属性
    ctx.status = err.status || err.statusCode || 500;
    ctx.body = {
      error: {
        message: err.message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
      }
    };
    // 将错误冒泡给 app.on('error')
    ctx.app.emit('error', err, ctx);
  }
});

// 在路由中抛出错误
router.get('/user/:id', async (ctx) => {
  const user = await db.find(ctx.params.id);
  ctx.assert(user, 404, `User ${ctx.params.id} not found`);
  // 等价于: if (!user) ctx.throw(404, '...')
  ctx.body = user;
});
```

---

## 6. Koa 与 Express 对比

| 维度 | Express | Koa |
|------|---------|-----|
| 版本 | v4（稳定）/ v5（beta）| v2 |
| 中间件模式 | 线形，直接调用 next() | 洋葱，await next() |
| async 支持 | 需显式 try/catch + next(err) | 原生支持，自动错误传播 |
| 核心代码量 | ~2000 行 | ~550 行 |
| 内置功能 | Router, 静态文件, Body Parser | 无（极简，靠中间件）|
| ctx 对象 | 分离的 req, res | 合并的 ctx |
| 路由 | express.Router 内置 | 需 @koa/router 包 |
| 流行度 | npm weekly: ~30M | npm weekly: ~3M |
| 适用场景 | 快速原型、中小项目 | 追求优雅、async-first |

### 什么时候选 Koa？
- 需要在请求前后都执行逻辑（如计时、事务管理）
- 追求代码的优雅和可读性
- team 熟悉 async/await 模式
- 构建 WebSocket、SSE 等复杂流处理

---

## 7. Koa 实用中间件模式

### 请求计时器
```javascript
app.use(async (ctx, next) => {
  const start = Date.now();
  await next(); // 等所有后续中间件执行完
  const ms = Date.now() - start;
  ctx.set('X-Response-Time', `${ms}ms`);
  console.log(`${ctx.method} ${ctx.url} - ${ms}ms`);
});
```

### 事务管理（数据库）
```javascript
app.use(async (ctx, next) => {
  const client = await pool.connect();
  const trx = await client.query('BEGIN');
  ctx.state.db = client;
  
  try {
    await next();
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err; // 重新抛出，让错误处理中间件处理
  } finally {
    client.release();
  }
});
```

### 缓存层
```javascript
app.use(async (ctx, next) => {
  if (ctx.method !== 'GET') return next();
  
  const cacheKey = ctx.url;
  const cached = await redis.get(cacheKey);
  
  if (cached) {
    ctx.body = JSON.parse(cached);
    ctx.set('X-Cache', 'HIT');
    return; // 不调用 next()，直接返回
  }
  
  await next(); // 让路由处理器设置 ctx.body
  
  // 路由执行完后，缓存结果
  if (ctx.status === 200 && ctx.body) {
    await redis.setex(cacheKey, 60, JSON.stringify(ctx.body));
    ctx.set('X-Cache', 'MISS');
  }
});
```

---

## 8. 练习 Checklist

- [ ] 运行 demo-koa-compose.js，理解洋葱模型的执行顺序
- [ ] 手动实现 `koa-compose`（不看源码版本）
- [ ] 实现一个 Koa 应用，包含：logger → auth → cache → router
- [ ] 对比 Koa 洋葱模型在"计时中间件"场景比 Express 更优雅的原因
- [ ] 理解 `ctx.throw(404)` 如何触发全局错误处理中间件
