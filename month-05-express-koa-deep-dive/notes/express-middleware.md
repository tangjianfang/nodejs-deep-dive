# Express 中间件链深度解析

## 1. Express 中间件本质

Express 中间件是一个函数，签名为：

```javascript
function middleware(req, res, next) {
  // req: 请求对象（IncomingMessage 的扩展）
  // res: 响应对象（ServerResponse 的扩展）
  // next: 调用下一个中间件
}
```

中间件栈是一个**线性数组**，按注册顺序依次执行：

```
app.use(mw1)
app.use(mw2)
app.use(mw3)

Request → [mw1] → next() → [mw2] → next() → [mw3] → Response
                                                   ↑
                     如果 mw2 不调用 next()，请求到此结束
```

---

## 2. `app.use` vs `app.get` vs `Router`

```javascript
const express = require('express');
const app = express();

// 1. app.use: 匹配所有方法，路径前缀匹配
app.use('/api', (req, res, next) => {
  console.log('所有 /api/* 请求都经过这里');
  next();
});

// 2. app.get/post/...: 精确方法匹配
app.get('/api/users', (req, res) => {
  res.json({ users: [] });
});

// 3. Router: 模块化路由
const userRouter = express.Router();
userRouter.get('/', (req, res) => res.json({ users: [] }));
userRouter.get('/:id', (req, res) => res.json({ id: req.params.id }));
app.use('/api/users', userRouter);
```

### 路径匹配规则
```
app.use('/api'):         匹配 /api, /api/, /api/users, /api/foo/bar
app.get('/api'):         只匹配 /api 和 /api/（精确匹配）
app.get('/api/:id'):     匹配 /api/123, /api/abc（捕获 :id）
app.get('/api/:id?'):    匹配 /api, /api/123（:id 可选）
app.get('/files/*'):     匹配 /files/a, /files/a/b/c（通配符）
```

---

## 3. `next()` 调用机制源码分析

Express 核心路由分发（简化）：

```javascript
// express/lib/router/index.js 核心逻辑（简化版）
function handle(req, res, out) {
  let idx = 0;
  const stack = this.stack; // 中间件数组
  
  function next(err) {
    // 取下一个中间件
    const layer = stack[idx++];
    if (!layer) return out(err); // 没有更多中间件
    
    // 路径匹配
    if (!layer.match(req.path)) return next(err);
    
    // 错误中间件（4个参数）vs 普通中间件（3个参数）
    if (err && layer.handle.length !== 4) return next(err); // 跳过普通中间件
    if (!err && layer.handle.length === 4) return next();   // 跳过错误中间件
    
    // 调用中间件
    try {
      layer.handle(err ? err : req, !err ? res : req, !err ? next : res /*, next if err */);
    } catch (e) {
      next(e); // 同步错误自动传递
    }
  }
  
  next();
}
```

---

## 4. 错误处理中间件（4 个参数）

```javascript
// ✅ 必须是 4 个参数，Express 通过参数数量(fn.length)区分
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: {
      message: err.message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    }
  });
});

// 如何触发错误处理：
// 1. 调用 next(error)
app.get('/throw', (req, res, next) => {
  next(new Error('Something went wrong'));
});

// 2. 抛出同步错误（Express 自动捕获）
app.get('/sync-throw', (req, res) => {
  throw new Error('sync error');
});

// 3. ⚠️ async 函数中的错误 Express 4.x 不会自动捕获！
app.get('/async-throw', async (req, res, next) => {
  try {
    await someAsyncOperation();
  } catch (err) {
    next(err); // 必须手动 next(err)
  }
});

// Express 5.x 会自动捕获 async 错误
// 或使用 express-async-errors 包
```

---

## 5. req 和 res 扩展

Express 对原生的 `IncomingMessage` 和 `ServerResponse` 进行了扩展：

### req 扩展
```javascript
req.params    // 路由参数 { id: '123' }
req.query     // 查询字符串 { page: '1' }
req.body      // 请求体（需 bodyParser 中间件）
req.headers   // 原始请求头
req.path      // 路径 '/api/users'
req.method    // 'GET', 'POST'...
req.ip        // 客户端 IP
req.hostname  // 'api.example.com'
req.protocol  // 'http' or 'https'
req.secure    // true if HTTPS
req.cookies   // （需 cookie-parser）
req.session   // （需 express-session）

// 在中间件之间传递数据（Express 约定俗成用 res.locals 或 req 直接挂载）
req.user = await authenticate(token); // 常见于 auth 中间件
```

### res 扩展
```javascript
res.status(200)        // 设置状态码（返回 res，可链式）
res.set('X-Foo', 'bar')// 设置响应头
res.json({ ok: true }) // 自动 JSON.stringify + Content-Type
res.send('text')       // 发送文本（自动检测类型）
res.sendFile(path)     // 发送文件（Stream）
res.redirect(301, '/') // 重定向
res.cookie('token', value, { httpOnly: true, sameSite: 'lax' })
res.clearCookie('token')
res.locals             // 模板变量，对本次请求可见
```

---

## 6. 内置中间件 & 常用第三方中间件

### Express 内置
```javascript
// 解析 JSON body（Express 4.16+）
app.use(express.json({ limit: '10mb' }));

// 解析 URL-encoded body（表单）
app.use(express.urlencoded({ extended: true }));

// 静态文件服务
app.use('/static', express.static('public', {
  maxAge: '1d',
  etag: true,
  lastModified: true,
}));
```

### 常用第三方
```javascript
const helmet = require('helmet');         // npm install helmet
const morgan = require('morgan');         // npm install morgan
const compression = require('compression'); // npm install compression
const rateLimit = require('express-rate-limit'); // npm install express-rate-limit

// 安全 headers（XSS、MIME sniffing、Clickjacking 等）
app.use(helmet());

// 请求日志
app.use(morgan('combined')); // Apache 格式
app.use(morgan(':method :url :status :response-time ms'));

// Gzip 压缩
app.use(compression({ threshold: 1024 })); // 超过 1KB 才压缩

// 限流
app.use('/api', rateLimit({
  windowMs: 60 * 1000,  // 1 分钟
  max: 100,             // 最多 100 次
  message: { error: 'Too many requests' },
}));
```

---

## 7. Express Router 模块化最佳实践

```javascript
// routes/users.js
const { Router } = require('express');
const router = Router();

// 路由级中间件（只对这个 Router 有效）
router.use((req, res, next) => {
  req.resourceType = 'user';
  next();
});

router.param('id', async (req, res, next, id) => {
  // 当路由包含 :id 时预处理
  const user = await UserService.findById(id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  req.targetUser = user;
  next();
});

router.get('/', async (req, res) => {
  const users = await UserService.list(req.query);
  res.json(users);
});

router.get('/:id', (req, res) => {
  res.json(req.targetUser); // router.param 已经查询好了
});

router.post('/', async (req, res, next) => {
  try {
    const user = await UserService.create(req.body);
    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
});

module.exports = router;

// app.js
const usersRouter = require('./routes/users');
app.use('/api/users', usersRouter);
```

---

## 8. Express 性能与局限性

### 局限性
| 问题 | Express 现状 | 解决方案 |
|------|-------------|---------|
| async 错误捕获 | Express 4.x 不自动捕获 | Express 5 / express-async-errors |
| 无 TypeScript 原生支持 | 需要 @types/express | 用 NestJS |
| 无 DI 框架 | 手动管理依赖 | NestJS / Awilix |
| 请求校验 | 无内置，用 joi/zod | 集成校验库 |
| 无内置测试约定 | 无 | supertest 集成测试 |
| 中间件链调试困难 | 无可视化工具 | 自定义日志中间件 |

### 性能优化
```javascript
// 1. 路由挂载顺序（频繁访问的路由放前面）
app.get('/health', ...) // 健康检查，最先匹配
app.get('/api/v2/...', ...) // 新版本 API
app.get('/api/v1/...', ...) // 旧版本（降级到最后匹配）

// 2. 禁用不需要的设置
app.disable('x-powered-by'); // 不暴露 Express 版本信息（也是安全措施）
app.set('etag', 'strong');   // 启用 ETag 缓存

// 3. 使用 router 而不是全局中间件
// ❌ 慢: 所有请求都走这个中间件
app.use(authMiddleware);
// ✅ 快: 只有 /api 路由需要认证
app.use('/api', authMiddleware);
```

---

## 9. 练习 Checklist

- [ ] 运行 demo-mini-express.js，手动测试路由匹配、中间件链
- [ ] 实现一个带有 logger → auth → rateLimit → handler 链的 Express 应用
- [ ] 理解为什么 `app.use((err, req, res, next) => {...})` 必须放在最后
- [ ] 对比 `app.use('/path', router)` 和 `app.use('/path', handler)` 的区别
- [ ] 实现 `express.json()` 的等价中间件（手动解析 body stream）
