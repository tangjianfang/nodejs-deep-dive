# 框架的本质 — Express/Koa/NestJS 中间件与依赖注入深度对比

> 📅 月度技术分享 | Month 05 | Node.js Deep Dive  
> ⏱️ 预计时长：60 分钟

---

## Slide 1 · 开场

### 一个问题

> **"Express、Koa、NestJS 你们用哪个？知道它们的核心区别吗？"**

```
Express:  "它就是个中间件管理器，我看过它的源码，大概1500行"
Koa:      "Express 的精神续作，async-first，洋葱模型更优雅"
NestJS:   "Angular 风格的 Node.js，DI 容器让大型项目更可维护"

本质上: 它们解决的是同一个问题——如何组织 HTTP 请求处理逻辑
差异在于: 组织方式和面向的项目规模
```

---

🗣️ **Speaker Notes:**  
今天我们把这三个框架的内核都拆开来看。  
目标：理解完今天的分享后，你能在 200 行内重新实现 Express 的核心，  
并且能解释 NestJS 的 @Injectable 是如何工作的。

---

## Slide 2 · Express 中间件链

### 中间件 = 函数队列

```javascript
// Express 的本质：维护一个函数队列
app._router.stack = [
  { handle: loggerMiddleware, path: '/' },
  { handle: authMiddleware, path: '/api' },
  { handle: userRouter, path: '/api/users' },
  { handle: errorMiddleware, path: '/' },  // 错误处理
]

// 执行机制：依次调用，next() 进入下一个
request → queue[0] → next() → queue[1] → next() → ... → response
```

### next() 源码（简化）
```javascript
function next(err) {
  const layer = stack[idx++];
  if (!layer) return done(err);              // 队列用完
  if (!layer.match(path)) return next(err);  // 路径不匹配，跳过
  
  // 错误中间件（4参数）vs 普通中间件（3参数）
  if (err && layer.fn.length !== 4) return next(err); // 跳过
  
  layer.fn(err ?? req, req, res, next);     // 调用！
}
```

---

🗣️ **Speaker Notes:**  
Live Demo: node demo-mini-express.js  
关键点：用 fn.length（函数参数个数）区分错误中间件和普通中间件。  
这是你在 Express 中**必须写 4 个参数**的错误中间件的原因！

---

## Slide 3 · Koa 洋葱模型

### koa-compose：37 行改变了中间件的设计范式

```javascript
// 关键：await next() 等待"后续所有中间件"完成
// 所以中间件可以在 await next() 前后都执行代码

app.use(async (ctx, next) => {
  // ← 进入（第一层洋葱外侧）
  const start = Date.now();
  await next();           // ← 等待内层全部完成
  const ms = Date.now() - start;
  ctx.set('X-Time', ms + 'ms'); // ← 退出（第一层洋葱内侧）
});
```

### 实现核心（compose 关键代码）
```javascript
function dispatch(i) {
  if (i <= index) throw new Error('next() called multiple times');
  index = i;
  const fn = middleware[i] ?? next;
  if (!fn) return Promise.resolve();
  return Promise.resolve(
    fn(ctx, () => dispatch(i + 1))  // ← 递归：下一个中间件
  );
}
```

---

🗣️ **Speaker Notes:**  
画图：洋葱图，展示请求进入时穿越各层，响应时反向穿越各层。  
对比 Express：Express 的"after"逻辑需要 hack res.end()，Koa 用 await next() 自然实现。  
最佳场景：事务（BEGIN...COMMIT）、计时、缓存（请求前查缓存，响应后写缓存）

---

## Slide 4 · Live Demo — koa-compose

```bash
node month-05-express-koa-deep-dive/notes/scripts/demo-koa-compose.js
```

输出示例：
```
1 进入 → 2 进入 → 3 处理请求 → 2 退出 → 1 退出

⏱ GET /api/users - 52ms

✓ 循环依赖检测: AService → BService → AService
```

### 三个关键设计
1. `index` 变量防止 `next()` 多次调用
2. `Promise.resolve()` 兼容同步/异步中间件
3. 递归调用而非循环，保证调用栈结束顺序

---

🗣️ **Speaker Notes:**  
着重展示 Demo 3（事务管理），这是洋葱模型最典型的应用。  
提问：**"如果在 Koa 中间件里 throw Error，会发生什么？"**  
答：错误沿着 Promise 链向外传播，被最外层 try/catch 捕获。

---

## Slide 5 · NestJS DI 容器

### 三步理解 IoC

```
步骤1: 声明依赖（@Injectable + 构造函数参数）
  @Injectable()
  class UserService {
    constructor(private repo: UserRepository) {}
    //           ↑ TypeScript 编译后存入 reflect-metadata
  }

步骤2: 注册到容器（@Module providers）
  @Module({ providers: [UserService, UserRepository] })

步骤3: 容器解析（自动递归实例化）
  container.resolve(UserController)
    → 需要 UserService
    → 需要 UserRepository
    → 实例化 UserRepository（无依赖，直接 new）
    → 实例化 UserService(repo)
    → 实例化 UserController(svc)
```

---

🗣️ **Speaker Notes:**  
Live Demo: node demo-nestjs-di.js  
重点展示：providers 注册顺序无关，容器自动拓扑排序。  
对比手动管理：Express 中你要自己写 const repo = new Repo(db); const svc = new Service(repo); const ctrl = new Controller(svc);

---

## Slide 6 · 四种 Provider

```typescript
// 1. useClass（最常见）
{ provide: UserService, useClass: UserService }
// 等价于: providers: [UserService]

// 2. useValue（配置项）
{ provide: 'JWT_SECRET', useValue: process.env.JWT_SECRET }

// 3. useFactory（异步初始化）
{
  provide: 'REDIS',
  useFactory: async (config: ConfigService) => {
    const client = new Redis(config.get('REDIS_URL'));
    await client.ping();  // 验证连接
    return client;
  },
  inject: [ConfigService],
}

// 4. useExisting（别名，不创建新实例）
{ provide: 'ILogger', useExisting: WinstonLogger }
```

### 测试时替换 Provider
```typescript
// test
const module = await Test.createTestingModule({
  providers: [
    UserService,
    { provide: UserRepository, useClass: MockUserRepository }, // ← 替换！
  ],
}).compile();
```

---

🗣️ **Speaker Notes:**  
这是 NestJS DI 最大的优势：测试时只需替换 provider，不需要修改业务代码。  
Factory Provider 是处理需要异步初始化的场景（Redis、DB、外部 API）的标准方式。

---

## Slide 7 · 三框架选择指南

### 决策矩阵

| 场景 | 推荐 | 原因 |
|------|------|------|
| 快速原型、内部工具 | Express | 最简单，文档多 |
| 中等规模 API，喜欢优雅代码 | Koa | 洋葱模型对 async 友好 |
| 大型项目、微服务、团队协作 | NestJS | 强类型，DI，约定优于配置 |
| 已有 Angular 团队 | NestJS | 同样的装饰器模式 |
| 追求极致性能 | Fastify | 比三者都快 |

### Bundle Size 和启动时间
```
Express: ~500KB, <100ms
Koa:     ~100KB, <50ms  
NestJS:  ~5MB (TypeScript 全套), 300-500ms
```

---

🗣️ **Speaker Notes:**  
没有最好的框架，只有最合适的框架。  
对于学习目的：Express 是最好的起点（简单、广泛使用）。  
对于生产大型项目：NestJS 的约定减少了大量决策成本。  
NestJS 性能已经很好，启动慢只影响冷启动（Serverless 场景要注意）。

---

## Slide 8 · 总结 & 作业

### 今天的核心收获

1. **Express 中间件** = 函数数组 + next() = 极简但强大的设计模式
2. **Koa 洋葱模型** = koa-compose 37行 + async/await = 中间件设计的进化
3. **NestJS DI** = reflect-metadata + token 解析 = 大型应用的可维护性保障
4. **框架本质** = 解决"如何组织 HTTP 处理逻辑"，思想比 API 更重要

### 作业

```
Level 1: node demo-mini-express.js，看懂路径匹配和 next() 逻辑
Level 2: node demo-koa-compose.js，手写一遍 compose 函数
Level 3: node demo-nestjs-di.js，为 IoCContainer 添加 REQUEST scope 支持
挑战题: 实现一个 Koa 风格的 express-to-koa 适配器
```

---

🗣️ **Speaker Notes:**  
下月：数据库集成！Prisma、MongoDB、Redis，以及让无数人踩坑的 N+1 问题。  
预习：先了解什么是 N+1 query problem。

---

*📌 参考资料*  
- [Express 4.x 源码](https://github.com/expressjs/express)  
- [koa-compose 37行源码](https://github.com/koajs/compose/blob/master/index.js)  
- [NestJS 依赖注入原理](https://docs.nestjs.com/fundamentals/custom-providers)
