# 📍 Node.js 深入学习路线图

> 技术栈锁定：Node.js v20+ · NestJS · PostgreSQL + MongoDB + Redis · REST + gRPC + MQ · Docker + K8s + CI/CD
> 当前日期：2026-03-03 | 状态图例：⬜ 未开始 · 🟡 进行中 · ✅ 已完成

---

## 快速导航

| 月份 | 主题 | 阶段 | 状态 |
|------|------|------|------|
| [M01](#m01--nodejs-核心基础与底层原理) | Node.js 核心基础与底层原理 | 夯实底层 | ✅ |
| [M02](#m02--异步编程深入) | 异步编程深入 | 夯实底层 | ✅ |
| [M03](#m03--stream-与-buffer-深入) | Stream 与 Buffer 深入 | 夯实底层 | ✅ |
| [M04](#m04--httphttps-与网络编程) | HTTP/HTTPS 与网络编程 | Web 进阶 | ✅ |
| [M05](#m05--web-框架深入-nestjs--expresskoafastify-对比) | Web 框架深入 (NestJS + 对比) | Web 进阶 | ✅ |
| [M06](#m06--数据库集成与-orm) | 数据库集成与 ORM | Web 进阶 | ✅ |
| [M07](#m07--认证授权与安全) | 认证授权与安全 | 企业级能力 | ✅ |
| [M08](#m08--测试与调试) | 测试与调试 | 企业级能力 | ✅ |
| [M09](#m09--性能优化与监控) | 性能优化与监控 | 企业级能力 | ✅ |
| [M10](#m10--微服务架构) | 微服务架构 | 架构与实战 | ✅ |
| [M11](#m11--devops-与部署) | DevOps 与部署 | 架构与实战 | ✅ |
| [M12](#m12--综合项目实战) | 综合项目实战 | 架构与实战 | ✅ |

---

## ══════════════════════════════════════
## 第一阶段：夯实底层 (M01–M03)
## ══════════════════════════════════════

---

## M01 — Node.js 核心基础与底层原理

### 🎯 本月目标

- 分析 V8 引擎的 JIT 编译流程、隐藏类与内联缓存机制，理解代码性能差异的根源
- 剖析 libuv 架构，绘制事件循环六阶段时序图，能准确预测异步代码执行顺序
- 实现一个兼容 CommonJS 规范的 `require()` 函数，理解模块解析算法与循环依赖处理
- 掌握 Node.js v20+ 新特性（原生测试、权限模型、ESM 成熟度），对比旧版本差异
- 建立 Node.js 整体架构认知：V8 + libuv + Node Bindings + JS 层的协作关系

### 📚 核心知识点

#### 1. V8 引擎原理
- Ignition 解释器 → TurboFan JIT 编译器的分层编译流程
- 隐藏类（Hidden Class）与形状（Shape）：属性添加顺序对性能的影响
- 内联缓存（Inline Cache）：单态、多态、超多态的性能差异
- 垃圾回收：新生代（Scavenge）与老生代（Mark-Sweep/Mark-Compact）
- 使用 `--print-opt-code`、`--trace-ic` 标志分析 V8 优化行为

#### 2. libuv 与事件循环
- libuv 的六个核心阶段：timers → pending callbacks → idle/prepare → poll → check → close callbacks
- Reactor 模式：I/O 多路复用（epoll/kqueue/IOCP）的平台差异
- `process.nextTick` 与 `queueMicrotask` 的优先级：高于所有 I/O 回调
- `setImmediate` vs `setTimeout(fn, 0)` 在不同上下文中的顺序不确定性
- 线程池（Thread Pool）：默认 4 线程，处理文件 I/O、DNS、crypto 等阻塞操作

#### 3. 模块系统深入
- CommonJS（CJS）模块包装函数：`(function(exports, require, module, __filename, __dirname) {})`
- 模块缓存机制：`require.cache` 与缓存失效策略
- ES Module（ESM）与 CJS 的互操作：`import()` 动态导入、`createRequire`
- 循环依赖的处理：CJS 的部分加载 vs ESM 的活绑定（Live Binding）
- 模块解析算法：相对路径 → 绝对路径 → node_modules 查找链

#### 4. Node.js 进程模型
- `process` 对象：`env`、`argv`、`execArgv`、`pid`、`ppid`
- 进程退出钩子：`process.on('exit')`、`process.on('beforeExit')`、`process.on('uncaughtException')`
- `process.nextTick` 实现原理：nextTickQueue 与 microtask 队列的关系
- 信号处理：`SIGTERM`、`SIGINT` 的优雅处理
- 标准流：`stdin`/`stdout`/`stderr` 是 Stream，不是简单的 console

#### 5. Node.js v20+ 新特性
- 原生测试运行器（`node:test`）：不依赖第三方库的测试方案
- 权限模型（Permission Model）：`--allow-fs-read`、`--allow-net` 等沙箱能力
- ESM 加载器 Hook（稳定化）：自定义模块加载逻辑
- URL-based Module Resolution：与浏览器对齐的模块解析
- `--watch` 模式：原生文件监听，替代 nodemon

### 🛠️ 实践任务

- [ ] **实现 mini-require**：编写 `my-require.js`，支持相对路径解析、模块缓存、循环依赖检测，通过 10 个单元测试
- [ ] **验证 Event Loop 时序**：编写 `event-loop-quiz.js`，包含 15 道输出预测题（覆盖 nextTick、Promise、setImmediate、setTimeout 各种组合），并附上详细注释解释原因
- [ ] **V8 性能实验**：编写 `v8-hidden-class.js`，对比「属性顺序一致」vs「属性动态添加」两种对象创建方式的性能差异（使用 `performance.now()` 测量 100 万次操作），差距应 > 2x
- [ ] **libuv 线程池实验**：编写 `thread-pool-demo.js`，通过并发 `fs.readFile` 操作验证线程池默认大小为 4，并演示 `UV_THREADPOOL_SIZE` 环境变量调优效果

### 📖 推荐资源

- **书籍**：《Node.js Design Patterns》(3rd Ed.) — Mario Casciaro (Chapter 1-2)；《深入浅出 Node.js》— 朴灵 (全书)
- **文章/博客**：[The Node.js Event Loop, Timers, and process.nextTick()](https://nodejs.org/en/docs/guides/event-loop-timers-and-nexttick)；[V8's Hidden Classes](https://v8.dev/docs/hidden-classes)；[libuv Design Overview](http://docs.libuv.org/en/v1.x/design.html)
- **官方文档**：[Node.js v20 API Docs](https://nodejs.org/docs/latest-v20.x/api/)；[V8 Developer Documentation](https://v8.dev/docs)；[libuv Documentation](http://docs.libuv.org/)

### 🎤 月度分享主题

> **分享标题**：揭秘 Node.js 事件循环 — 你以为你懂，其实你不懂
>
> **核心内容**：① 现场出 5 道事件循环输出预测题让团队作答 → ② 用动画图解每道题的执行路径 → ③ 揭示 V8 隐藏类对性能影响的真实 Benchmark → ④ 用 `--trace-ic` 实时演示内联缓存命中/失效
>
> **预计时长**：45-60 分钟

### ✅ 完成标准（Definition of Done）

- [ ] `my-require.js` 通过所有单元测试，支持循环依赖场景
- [ ] 能徒手绘制事件循环六阶段图，并正确注明每阶段的回调来源
- [ ] V8 性能实验有可重现的 Benchmark 报告，说明性能差异原因
- [ ] 完成分享 PPT / 可视化图表，团队成员能答对 60% 以上的预测题
- [ ] 阅读完《深入浅出 Node.js》第 1-4 章并写下读书笔记

---

## M02 — 异步编程深入

### 🎯 本月目标

- 实现符合 Promise/A+ 规范的 `MyPromise` 类，深入理解微任务队列调度机制
- 分析 `async/await` 的 AST 转换产物，理解其与 Generator + Promise 的等价关系
- 构建并发控制工具库，解决生产环境中的并发爆炸、背压失控问题
- 掌握 `AsyncLocalStorage` 实现请求级别的上下文传递（替代 Thread Local 模式）
- 建立异步错误处理的完整策略：unhandledRejection、错误边界、重试机制

### 📚 核心知识点

#### 1. Promise 深度剖析
- Promise/A+ 规范的完整解读：状态机、then 链式调用、resolvePromise 过程
- 微任务队列（Microtask Queue）vs 宏任务队列（Macrotask Queue）的调度优先级
- Promise 静态方法对比：`all` vs `allSettled` vs `any` vs `race` 的语义差异与使用场景
- 自定义 Thenable 对象与 Promise 互操作
- Promise 的内存泄漏：永不 resolve/reject 的 Promise 对 GC 的影响

#### 2. async/await 底层原理
- Generator 函数与协程（Coroutine）概念：`yield` 暂停执行的机制
- 自动执行器（Auto Runner）：将 Generator 与 Promise 结合的 `co` 库原理
- Babel 对 `async/await` 的编译产物分析：状态机转换
- `await` 对非 Promise 值的处理：等价于 `Promise.resolve(value)`
- 顶层 `await`（Top-level await）在 ESM 中的使用与注意事项

#### 3. 并发控制模式
- 串行执行（Serial）：`for...of` + `await`，避免并发副作用
- 并行执行（Parallel）：`Promise.all`，注意连接数/资源限制
- 限流并发（Rate-limited Concurrency）：`p-limit` 实现原理，滑动窗口算法
- 批处理（Batching）：`p-map` 按批次处理大量异步任务
- 队列（Queue）：`p-queue` 实现优先级队列、任务暂停/恢复

#### 4. 异步上下文追踪
- `AsyncLocalStorage`：Node.js v16+ 稳定 API，实现异步上下文传播
- `AsyncResource`：手动绑定异步上下文，用于自定义异步场景（EventEmitter、回调）
- `AsyncHooks`（底层）：追踪异步资源生命周期，性能开销注意事项
- 实战：用 `AsyncLocalStorage` 实现请求 ID 在整个调用链中的自动传递

#### 5. 异步错误处理策略
- `try/catch` 无法捕获非 `await` 的 Promise 拒绝
- `process.on('unhandledRejection')` 全局兜底：Node.js v15+ 默认抛出致命错误
- `process.on('uncaughtException')` 的正确使用：仅用于日志记录，不用于恢复
- `AbortController` + `AbortSignal`：取消长时间运行的异步操作（fetch、定时器）
- 指数退避重试（Exponential Backoff）：实现带 jitter 的重试策略

### 🛠️ 实践任务

- [ ] **实现 Promise/A+ 规范**：编写 `my-promise.js`，通过 [promises-aplus-tests](https://github.com/promises-aplus/promises-aplus-tests) 的全部 872 个测试用例
- [ ] **实现并发控制器**：编写 `concurrent-limiter.js`，支持 `maxConcurrent` 限制、`timeout` 超时、`onTaskDone` 回调，并用 1000 个模拟 HTTP 请求验证效果，均值吞吐量误差 < 5%
- [ ] **实现请求链路追踪**：在 NestJS 应用中集成 `AsyncLocalStorage`，实现 `RequestId` 从 HTTP 入口到数据库查询日志的全链路自动传递，无需手动透传参数

### 📖 推荐资源

- **书籍**：《JavaScript: The Good Parts》— Douglas Crockford；《You Don't Know JS: Async & Performance》— Kyle Simpson (免费开源)
- **文章/博客**：[Promises/A+ Specification](https://promisesaplus.com/)；[How JavaScript Promises Actually Work](https://blog.bitsrc.io/how-javascript-promises-actually-work-internals-7c2ba5bfe481)；[AsyncLocalStorage Deep Dive](https://nodejs.org/api/async_context.html)
- **官方文档**：[Node.js Async Hooks](https://nodejs.org/api/async_hooks.html)；[Node.js AsyncLocalStorage](https://nodejs.org/api/async_context.html)；[MDN Promise Documentation](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)

### 🎤 月度分享主题

> **分享标题**：从回调地狱到优雅异步 — Node.js 异步编程演化史与最佳实践
>
> **核心内容**：① 异步演化时间线（Callback → Promise → async/await）② 现场 Code Review：找出团队代码中 3 种典型异步反模式（忘记 await、Promise 吞错、并发爆炸）③ 演示 AsyncLocalStorage 在链路追踪中的魔法效果 ④ 并发控制器的实现原理与性能数据
>
> **预计时长**：45 分钟

### ✅ 完成标准（Definition of Done）

- [ ] `my-promise.js` 通过 promises-aplus-tests 全部测试用例
- [ ] 并发控制器在 1000 个任务场景下，实际并发数与设定值误差 < 5%
- [ ] NestJS 项目中 RequestId 在日志中全链路可见（包括数据库层）
- [ ] 能清晰解释 `Promise.all` 内部并发与串行 `for await...of` 的性能差异
- [ ] 写一篇 Blog 总结异步错误处理的 5 种模式

---

## M03 — Stream 与 Buffer 深入

### 🎯 本月目标

- 实现自定义 Readable、Writable、Transform Stream，理解背压（Backpressure）的触发与响应机制
- 分析 Buffer 与 TypedArray 的底层关系，掌握零拷贝（Zero-Copy）技术原理
- 构建处理 GB 级文件的流式数据管道，内存占用稳定在 < 50MB
- 对比 Node.js Streams 与 Web Streams API 的差异，理解未来 API 趋势
- 掌握 `stream.pipeline()` 的错误处理优势，替代不安全的 `.pipe()` 链

### 📚 核心知识点

#### 1. Buffer 深入
- `Buffer` 是 `Uint8Array` 的子类：与 TypedArray 的关系与区别
- Buffer 的内存分配策略：小 Buffer（< 4KB）使用预分配的 8KB Pool，大 Buffer 独立分配
- 零拷贝技术：`Buffer.allocUnsafe()` vs `Buffer.alloc()` 的性能与安全权衡
- 字符编码处理：`utf8`、`utf16le`、`base64`、`hex` 编码转换
- `StringDecoder`：正确处理跨 chunk 的多字节字符（如中文字符的分割问题）

#### 2. Stream 核心机制
- 四种 Stream 类型：`Readable`（可读）、`Writable`（可写）、`Duplex`（双工）、`Transform`（转换）
- 两种读取模式：暂停模式（Paused Mode）vs 流动模式（Flowing Mode）的切换时机
- `highWaterMark`：内部缓冲区阈值，触发背压信号的临界点
- 背压机制：`writable.write()` 返回 `false` → 暂停读取 → `drain` 事件 → 恢复读取
- `objectMode`：处理非 Buffer/String 对象的流模式

#### 3. 自定义 Stream 实现
- 继承 `stream.Readable`：实现 `_read(size)` 方法，正确使用 `this.push(chunk)`
- 继承 `stream.Writable`：实现 `_write(chunk, encoding, callback)` 方法
- 继承 `stream.Transform`：实现 `_transform(chunk, encoding, callback)` 方法
- 继承 `stream.Duplex`：同时实现读写逻辑（TCP Socket 的实现范式）
- 使用 `stream.Readable.from()` 从异步迭代器创建可读流

#### 4. Pipeline 与错误处理
- `stream.pipeline()` vs `.pipe()`：前者正确处理错误并自动清理
- `stream/promises` 模块：`pipeline()` 的 Promise 版本（Node.js v15+）
- 流的错误传播：错误不会自动沿 `.pipe()` 链传播的陷阱
- `stream.finished()`：检测 stream 完成或出错的通用方法
- 使用 `for await...of` 消费可读流（Async Iteration）

#### 5. Web Streams API
- `ReadableStream`、`WritableStream`、`TransformStream`：浏览器与 Node.js 统一的流 API
- `TextEncoderStream` / `TextDecoderStream`：内置的文本转换流
- Node.js Streams 与 Web Streams 的互转：`Readable.toWeb()` / `Readable.fromWeb()`
- 应用场景：Fetch API 返回 Web ReadableStream，与 Node.js 处理的集成

### 🛠️ 实践任务

- [ ] **实现 CSV Transform Stream**：编写 `csv-parser.js`，实现一个 Transform Stream，将 CSV 格式的 Buffer chunk 解析为 JavaScript 对象（处理跨 chunk 的行分割、引号转义），支持 100MB+ 文件，内存占用 < 20MB
- [ ] **构建大文件上传服务**：编写基于 NestJS + Multipart 的分片上传服务，使用 Stream 处理（不将文件完整读入内存），支持断点续传，用 1GB 测试文件验证内存稳定性
- [ ] **背压实验**：编写 `backpressure-demo.js`，模拟快速 Readable + 慢速 Writable 场景，对比「无背压处理」（内存暴涨）vs「正确背压处理」（内存稳定）的内存占用曲线，差异应 > 10x

### 📖 推荐资源

- **书籍**：《Node.js Design Patterns》(3rd Ed.) — Chapter 6 (Coding with Streams)；《Node.js in Action》(2nd Ed.) — Chapter 5
- **文章/博客**：[Backpressuring in Streams](https://nodejs.org/en/docs/guides/backpressuring-in-streams)；[Node.js Streams: Everything You Need to Know](https://www.freecodecamp.org/news/node-js-streams-everything-you-need-to-know-c9141306be93/)；[Understanding Streams in Node.js](https://nodesource.com/blog/understanding-streams-in-nodejs/)
- **官方文档**：[Node.js Stream API](https://nodejs.org/api/stream.html)；[Node.js Buffer API](https://nodejs.org/api/buffer.html)；[Web Streams API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API)

### 🎤 月度分享主题

> **分享标题**：Stream 才是 Node.js 的灵魂 — 处理 GB 级数据的正确姿势
>
> **核心内容**：① 现场演示 `readFile` vs `createReadStream` 处理 500MB 文件的内存占用对比（实时内存监控图）② 背压机制动画演示：生产者-消费者速度不匹配时的数据流控制 ③ 现场 Code Review：找出常见的流使用错误（`.pipe()` 链不处理错误）④ Web Streams 未来趋势介绍
>
> **预计时长**：40 分钟

### ✅ 完成标准（Definition of Done）

- [ ] CSV Transform Stream 正确处理跨 chunk 的行分割，通过测试用例覆盖边界情况
- [ ] 大文件上传服务在 1GB 文件测试中，Node.js 进程内存峰值 < 100MB
- [ ] 背压实验有可重现的内存对比图，并能解释差异原因
- [ ] 能区分 4 种 Stream 类型的使用场景，并现场演示自定义 Transform Stream 的实现
- [ ] 完成 `stream.pipeline()` 的错误处理 vs `.pipe()` 安全性对比实验

---

## ══════════════════════════════════════
## 第二阶段：Web 开发进阶 (M04–M06)
## ══════════════════════════════════════

---

## M04 — HTTP/HTTPS 与网络编程

### 🎯 本月目标

- 实现不依赖任何框架的 HTTP/1.1 服务器，深入理解 Keep-Alive、Chunked Transfer 机制
- 对比 HTTP/1.1、HTTP/2、HTTP/3 的多路复用差异，在 Node.js 中分别实现和测试
- 构建 WebSocket 实时双向通信服务，理解握手升级、帧协议、心跳机制
- 实现 HTTP 反向代理，理解 CONNECT 隧道、负载均衡、连接复用
- 掌握 TLS/SSL 配置最佳实践：证书管理、HTTPS 性能优化、HSTS

### 📚 核心知识点

#### 1. HTTP 协议深入
- HTTP/1.1 核心特性：Keep-Alive 持久连接、管道化（Pipelining）、队头阻塞（Head-of-Line Blocking）
- HTTP 消息格式：请求行/响应行、Header 解析、Body 处理（Content-Length vs Chunked）
- HTTP/2 核心改进：二进制分帧、多路复用（Multiplexing）、Header 压缩（HPACK）、服务器推送
- HTTP/3 基础：基于 QUIC 协议，UDP + TLS 1.3，解决 TCP 层面的队头阻塞
- Node.js `http2` 模块：服务器推送（Server Push）、流控制

#### 2. TCP/UDP 网络编程
- `net` 模块：创建 TCP Server/Client，理解 Socket 的生命周期
- TCP 三次握手、四次挥手对 Node.js 服务启动/关闭的影响
- `dgram` 模块：UDP 的无连接特性、`socket.send()`、广播与多播
- TIME_WAIT 状态：`SO_REUSEADDR` 与端口复用
- Nagle 算法：`TCP_NODELAY` 对实时通信的影响

#### 3. WebSocket 协议与实现
- WebSocket 握手升级过程：`Upgrade: websocket`、`Sec-WebSocket-Key` 计算
- WebSocket 帧协议：FIN bit、Opcode（text/binary/ping/pong/close）、Masking
- 心跳机制（Heartbeat）：Ping/Pong frame，检测断线并重连
- `ws` 库深入：事件模型、连接管理、广播实现
- Server-Sent Events（SSE）：单向推送，HTTP 长连接，比 WebSocket 更轻量

#### 4. HTTPS 与 TLS
- TLS 握手过程：证书验证、密钥交换、会话恢复
- `https` 模块配置：自签名证书、CA 证书链
- TLS 性能优化：Session Tickets、OCSP Stapling、HTTP/2 + TLS 1.3
- `NODE_EXTRA_CA_CERTS` 环境变量：信任自定义 CA
- HSTS（HTTP Strict Transport Security）与证书透明度

#### 5. 代理与网络工具
- `http-proxy` 反向代理：转发请求、修改 Headers、负载均衡
- HTTP CONNECT 方法：创建 TCP 隧道（HTTPS 代理的工作原理）
- `undici`（Node.js 内置 fetch）：现代 HTTP 客户端，连接池管理
- 请求/响应拦截器模式（类 Axios Interceptors）的实现

### 🛠️ 实践任务

- [ ] **实现 mini-HTTP 服务器**：编写 `mini-http-server.js`，仅使用 `net` 模块（TCP 层）实现 HTTP/1.1 服务器，支持 GET/POST、Keep-Alive、Chunked 响应，通过 curl 验证基本功能
- [ ] **实现实时聊天室**：基于 NestJS + `ws` 实现多房间聊天室，支持用户加入/离开通知、历史消息（Redis 存储最近 50 条）、心跳检测（30s 超时踢出），前端用原生 WebSocket API 连接
- [ ] **实现 HTTP 反向代理**：编写 `reverse-proxy.js`，支持基于 URL 前缀的路由转发、请求头注入（X-Forwarded-For）、简单轮询负载均衡，使用 autocannon 测试代理吞吐量

### 📖 推荐资源

- **书籍**：《HTTP: The Definitive Guide》— David Gourley；《High Performance Browser Networking》— Ilya Grigorik (免费在线阅读)
- **文章/博客**：[HTTP/2 explained](https://http2-explained.haxx.se/)；[WebSocket Protocol (RFC 6455)](https://tools.ietf.org/html/rfc6455)；[Node.js net module guide](https://nodejs.org/api/net.html)
- **官方文档**：[Node.js HTTP module](https://nodejs.org/api/http.html)；[Node.js HTTP/2 module](https://nodejs.org/api/http2.html)；[Node.js TLS/SSL](https://nodejs.org/api/tls.html)

### 🎤 月度分享主题

> **分享标题**：从 TCP 握手到 HTTP/3 — Node.js 网络编程全景图
>
> **核心内容**：① Wireshark 抓包演示 HTTP/1.1 vs HTTP/2 多路复用的帧差异 ② WebSocket 握手过程动画 ③ 现场演示 HTTP/2 Server Push 提升页面加载速度 ④ 反向代理的实现原理与生产配置建议
>
> **预计时长**：50 分钟

### ✅ 完成标准（Definition of Done）

- [ ] mini-HTTP 服务器通过 curl 测试，正确响应 GET/POST 请求，Keep-Alive 连接复用可验证
- [ ] 聊天室支持 10 个并发 WebSocket 连接，心跳检测功能正常运作
- [ ] 反向代理在 autocannon 压测中，延迟增加 < 2ms（与直连对比）
- [ ] 能用 Wireshark 或 Chrome DevTools Network 面板解释 HTTP/2 帧结构
- [ ] 输出 HTTP/1.1 vs HTTP/2 性能对比报告（同一应用场景下的并发吞吐量对比）

---

## M05 — Web 框架深入 (NestJS + Express/Koa/Fastify 对比)

### 🎯 本月目标

- 深入 NestJS 核心架构：依赖注入（DI）容器、模块系统、装饰器元编程，构建生产级 API
- 通过源码分析对比 Express（中间件链）、Koa（洋葱模型）、Fastify（插件图）的设计差异
- 实现 NestJS 的 Guards、Interceptors、Pipes、Filters 四大增强机制，理解 AOP 思想
- 构建完整的 NestJS CRUD 应用（含认证、验证、错误处理、Swagger 文档）
- 输出框架选型指南：针对不同场景（快速原型、企业级、高性能）给出量化建议

### 📚 核心知识点

#### 1. NestJS 核心架构
- 依赖注入（Dependency Injection）：IoC 容器原理、Provider 的三种注入方式（构造器、属性、方法）
- 模块系统：`@Module` 声明、`imports`/`exports`/`providers`/`controllers` 的作用
- 装饰器（Decorator）元编程：`Reflect.metadata` API，NestJS 如何在运行时读取元数据
- 生命周期钩子：`OnModuleInit`、`OnApplicationBootstrap`、`OnModuleDestroy` 的执行顺序
- 动态模块（Dynamic Modules）：`register()` / `forRoot()` / `forFeature()` 模式

#### 2. NestJS 四大增强机制（AOP）
- **Guards**（授权守卫）：执行时机（路由处理器前），实现基于角色的权限控制（RBAC）
- **Interceptors**（拦截器）：执行时机（围绕路由处理器），实现日志、缓存、响应转换
- **Pipes**（管道）：执行时机（参数验证/转换），`class-validator` + `class-transformer` 集成
- **Exception Filters**（异常过滤器）：统一错误响应格式，自定义 HTTP 异常
- 执行顺序：Middleware → Guards → Interceptors（pre）→ Pipes → Handler → Interceptors（post）→ Filters

#### 3. Express 中间件模型
- `connect` 中间件的 `(req, res, next)` 函数链实现
- Router 的树形路由匹配（`path-to-regexp`）
- 错误处理中间件的四参数签名 `(err, req, res, next)`
- Express 的性能瓶颈：中间件链线性遍历，无法并行

#### 4. Koa 洋葱模型
- `compose()` 函数：将中间件数组转换为嵌套的 Promise 链
- 洋葱执行顺序：请求进入时从外到内，响应返回时从内到外
- `ctx` 上下文对象：对 `req`/`res` 的代理与扩展
- Koa 无内置路由：`@koa/router` 补充路由能力

#### 5. Fastify 插件系统
- 插件封装机制（Encapsulation）：每个插件有独立的作用域，避免全局污染
- Schema 驱动验证：使用 JSON Schema 进行请求/响应验证，比 `class-validator` 快 10x
- 序列化加速：`fast-json-stringify` 比 `JSON.stringify` 快 2-3x
- Hooks 系统：`onRequest`、`preValidation`、`preHandler`、`onSend` 等生命周期钩子

### 🛠️ 实践任务

- [ ] **构建完整 NestJS API**：实现「用户管理」模块，包含 CRUD 操作、JWT 认证 Guard、`class-validator` 参数校验 Pipe、统一响应格式 Interceptor、全局异常 Filter、Swagger（`@nestjs/swagger`）文档，测试覆盖率 > 80%
- [ ] **实现 mini-Express**：编写 `mini-express.js`（< 100 行），核心功能：中间件注册与执行、路由匹配（GET/POST）、错误处理中间件，通过 10 个集成测试
- [ ] **框架 Benchmark**：使用 autocannon 对 Express、Koa、Fastify、NestJS 进行相同业务逻辑（JSON 序列化 + 简单路由）的吞吐量测试，输出含图表的对比报告，结论需包含「在 X 场景下选择 Y 框架的理由」

### 📖 推荐资源

- **书籍**：《NestJS: A Progressive Node.js Framework》(官方文档即最佳书籍)；《Express in Action》— Evan Hahn
- **文章/博客**：[NestJS Official Documentation](https://docs.nestjs.com/)；[Koa.js 源码分析](https://github.com/koajs/koa/blob/master/lib/application.js)；[Fastify Benchmarks](https://fastify.dev/benchmarks)
- **官方文档**：[NestJS Docs](https://docs.nestjs.com/)；[Fastify Docs](https://fastify.dev/docs/latest/)；[Koa Docs](https://koajs.com/)

### 🎤 月度分享主题

> **分享标题**：Express vs Koa vs Fastify vs NestJS — 如何为团队选择正确的框架
>
> **核心内容**：① 四大框架中间件/插件机制动画对比 ② 现场演示 NestJS DI 容器如何解析依赖图 ③ Benchmark 数据展示（并附条件说明，避免误导）④ 团队当前场景下的选型建议与迁移路径
>
> **预计时长**：50 分钟

### ✅ 完成标准（Definition of Done）

- [ ] NestJS 用户管理 API 所有端点有 Swagger 文档，测试覆盖率 > 80%
- [ ] mini-Express 通过 10 个集成测试，代码 < 100 行
- [ ] Benchmark 报告包含至少 4 个框架、3 种场景（轻量路由、JSON 处理、中间件密度）的对比数据
- [ ] 能从源码层面解释洋葱模型与 Express 中间件链的执行差异
- [ ] 完成一篇「NestJS 核心概念图解」的团队内部文章

---

## M06 — 数据库集成与 ORM

### 🎯 本月目标

- 实现 PostgreSQL + Prisma 的完整数据层：查询优化、事务、Migration、Full-Text Search
- 实现 MongoDB + Mongoose 的文档模型设计：Schema 设计原则、聚合管道、索引策略
- 构建 Redis 多场景方案：缓存穿透/击穿/雪崩防护、分布式锁、BullMQ 任务队列
- 对比 Prisma vs TypeORM vs Drizzle 的 DX（开发体验）、类型安全性、运行时性能
- 实现 DataLoader 解决 N+1 查询问题，并通过慢查询日志验证优化效果

### 📚 核心知识点

#### 1. PostgreSQL 深入
- 连接池管理：`pg` 驱动的 Pool 配置（`max`、`idleTimeoutMillis`、`connectionTimeoutMillis`）
- 查询优化：`EXPLAIN ANALYZE` 解读，索引类型（B-tree、GIN、GiST）的选择
- 事务隔离级别：`READ COMMITTED`、`REPEATABLE READ`、`SERIALIZABLE` 的差异与 Node.js 实现
- `pg-listen` 与 `NOTIFY/LISTEN`：PostgreSQL 原生实时通知机制
- JSON/JSONB 列：半结构化数据存储与查询（`@>` 包含操作符）

#### 2. ORM 对比（Prisma / TypeORM / Drizzle）
- **Prisma**：Schema-first，生成强类型 Client，`prisma migrate` 流程，关系查询（`include`/`select`）
- **TypeORM**：Code-first，装饰器 Entity，与 NestJS 的深度集成（`@InjectRepository`）
- **Drizzle**：SQL-first，轻量级，TypeScript 原生，查询构建器而非完整 ORM
- N+1 问题：识别方法（日志分析）与解决方案（JOIN、`include`、DataLoader）
- Migration 策略：开发环境 `dev migrate` vs 生产环境的安全迁移步骤

#### 3. MongoDB 深入
- Schema 设计原则：嵌入文档（Embedding）vs 引用（Referencing）的权衡
- Mongoose Schema 高级特性：虚拟字段（Virtuals）、中间件（Pre/Post Hooks）、判别器（Discriminators）
- 聚合管道（Aggregation Pipeline）：`$match`、`$group`、`$lookup`（关联查询）、`$project`
- 索引策略：复合索引、文本索引（`$text`）、TTL 索引、稀疏索引
- 事务支持（Multi-document ACID）：需要 Replica Set，`session.withTransaction()`

#### 4. Redis 多场景应用
- 缓存三大问题防护：
  - **穿透**（查询不存在的数据）：布隆过滤器（Bloom Filter）防护
  - **击穿**（热点 Key 过期）：互斥锁（SETNX）防止并发重建
  - **雪崩**（大量 Key 同时过期）：随机 TTL + 多级缓存
- 分布式锁：Redlock 算法实现，`SET key value NX PX timeout` 原子操作
- BullMQ 任务队列：Job 的生命周期、重试策略（指数退避）、优先级、延迟任务

#### 5. 数据库最佳实践
- 连接池监控：空闲连接、等待队列长度、连接泄漏检测
- 软删除（Soft Delete）模式的实现与查询过滤
- 乐观锁（Optimistic Locking）：`version` 字段 + CAS 更新
- 数据库健康检查（Health Check）：NestJS HealthModule 集成

### 🛠️ 实践任务

- [ ] **构建完整数据层**：在 NestJS 项目中集成 Prisma（PostgreSQL），实现用户、文章、评论的多表关系（1对多、多对多），包含 Migration 文件、种子数据（Seeder）、软删除、乐观锁，用 `EXPLAIN ANALYZE` 验证关键查询有索引
- [ ] **实现 Redis 缓存装饰器**：实现 NestJS `@Cacheable()` 装饰器，支持 TTL 配置、缓存键自动生成（基于方法名 + 参数 Hash）、手动失效（`@CacheEvict()`），并演示缓存击穿防护（使用 Redlock 互斥锁）
- [ ] **实现任务队列服务**：基于 BullMQ + Redis，实现「邮件发送」任务队列，支持失败重试（最多 3 次，指数退避）、死信队列（DLQ）、BullBoard 可视化监控界面，模拟 1000 条任务的处理吞吐量

### 📖 推荐资源

- **书籍**：《MongoDB: The Definitive Guide》(3rd Ed.) — Kristina Chodorow；《Redis in Action》— Josiah Carlson
- **文章/博客**：[Prisma vs TypeORM vs Drizzle](https://www.prisma.io/dataguide/types/relational/comparing-node-orm)；[Redis Redlock Algorithm](https://redis.io/docs/manual/patterns/distributed-locks/)；[The Little MongoDB Book](https://openmymind.net/mongodb.pdf)
- **官方文档**：[Prisma Documentation](https://www.prisma.io/docs)；[Mongoose Documentation](https://mongoosejs.com/docs/)；[BullMQ Documentation](https://docs.bullmq.io/)；[Redis Commands](https://redis.io/commands/)

### 🎤 月度分享主题

> **分享标题**：Node.js 数据库最佳实践 — 从连接池调优到缓存防击穿
>
> **核心内容**：① Prisma vs TypeORM DX 对比演示（相同功能的代码量和类型安全性）② N+1 问题现场演示（慢查询日志 → DataLoader 优化 → 性能对比）③ Redis 缓存三大问题场景模拟 ④ BullMQ 任务队列架构图解
>
> **预计时长**：50 分钟

### ✅ 完成标准（Definition of Done）

- [ ] Prisma 数据层通过所有 CRUD 测试，关键查询的 `EXPLAIN ANALYZE` 显示 `Index Scan`（非 `Seq Scan`）
- [ ] Redis 缓存装饰器在并发测试中，缓存击穿场景下数据库只被查询 1 次（而非 N 次）
- [ ] BullMQ 服务处理 1000 个任务，失败率为 0（模拟错误通过重试恢复），BullBoard 数据可视
- [ ] 能清晰解释 Prisma 与 TypeORM 在事务处理上的 API 差异
- [ ] 输出一份数据库连接池调优的参数化建议文档

---

## ══════════════════════════════════════
## 第三阶段：企业级能力 (M07–M09)
## ══════════════════════════════════════

---

## M07 — 认证授权与安全

### 🎯 本月目标

- 构建完整的 JWT + Refresh Token 双令牌认证体系，实现安全的令牌轮换与黑名单策略
- 实现 OAuth 2.0 授权码流程（以 GitHub 为 Provider），理解 PKCE 扩展的安全必要性
- 在 NestJS 中实现基于角色（RBAC）和基于资源（ABAC）的两级权限模型
- 修复团队代码中常见的 OWASP Top 10 漏洞，输出安全审查 Checklist
- 掌握 `crypto` 模块：实现密码哈希（Argon2/bcrypt）、数字签名、AES 加密

### 📚 核心知识点

#### 1. JWT 深入
- JWT 结构：Header.Payload.Signature，Base64URL 编码与签名验证
- 签名算法对比：`HS256`（对称，共享密钥）vs `RS256`（非对称，公私钥），生产推荐 RS256
- 刷新令牌策略：短期 Access Token（15min）+ 长期 Refresh Token（7d）存储于 HttpOnly Cookie
- Token 黑名单：使用 Redis `SET` + TTL 存储失效 Token（Logout 场景）
- JWT 安全陷阱：`alg: none` 攻击、信息泄露（Payload 未加密）、未验证签名

#### 2. OAuth 2.0 / OpenID Connect
- OAuth 2.0 四种授权流程：授权码（Code）、隐式（Implicit）、客户端凭证（Client Credentials）、密码（Password）
- PKCE（Proof Key for Code Exchange）：防止授权码拦截攻击，移动端/SPA 必须使用
- OpenID Connect：在 OAuth 2.0 基础上的身份层，`id_token` 携带用户信息
- Passport.js 策略模式：`passport-jwt`、`passport-github2` 在 NestJS 中的集成
- Token 内省（Introspection）与 JWKS 端点：动态获取公钥进行验证

#### 3. 权限模型设计
- RBAC（角色权限控制）：用户 → 角色 → 权限的三层模型，NestJS Guards 实现
- ABAC（属性权限控制）：基于用户属性、资源属性、环境属性的细粒度授权（CASL 库）
- 资源所有权验证：「只能编辑自己的文章」类型的行级别权限
- 权限缓存：Redis 缓存用户权限信息，设置合理的失效策略

#### 4. OWASP Top 10 防护
- **注入攻击**：SQL 注入（使用 ORM 参数化查询）、NoSQL 注入（MongoDB `$where` 运算符）
- **XSS**：`helmet` CSP 头、输入净化（`DOMPurify`/`sanitize-html`）、HttpOnly Cookie
- **CSRF**：SameSite Cookie 属性、CSRF Token（`csurf`）
- **敏感数据暴露**：字段序列化黑名单（不返回 `password` 字段）、HTTPS 强制
- **速率限制**：`@nestjs/throttler` 实现 IP 级别限流，Redis 存储计数器

#### 5. 密码学实践
- 密码哈希：`argon2` 库（推荐，内存硬哈希）vs `bcrypt`（广泛使用），成本参数配置
- Node.js `crypto` 模块：`createCipheriv` / `createDecipheriv`（AES-256-GCM）、`createHmac`
- `crypto.randomBytes()` vs `Math.random()`：加密安全的随机数
- 数字签名：`createSign` / `createVerify` 实现文件/数据完整性验证

### 🛠️ 实践任务

- [ ] **完整认证系统**：在 NestJS 中实现 JWT + Refresh Token 认证，要求：Access Token（RS256，15min）、Refresh Token（HttpOnly Cookie，7d 轮换）、Redis Token 黑名单（Logout）、`/auth/me` 端点、账户锁定（5次失败锁定15分钟），通过完整的集成测试
- [ ] **OAuth2 GitHub 登录**：实现 GitHub OAuth2 授权码 + PKCE 流程，用户首次登录自动注册，已注册账户自动关联，前端展示用户头像和用户名，安全传递 state 参数防 CSRF
- [ ] **安全漏洞攻防演练**：搭建一个故意包含 5 种 OWASP 漏洞（SQL注入、XSS、CSRF、敏感数据暴露、失效认证）的 Demo 应用，先演示攻击成功，再逐一修复并验证修复有效性

### 📖 推荐资源

- **书籍**：《Web Application Security: Exploitation and Countermeasures》— Andrew Hoffman；《OAuth 2 in Action》— Justin Richer
- **文章/博客**：[OWASP Top 10](https://owasp.org/www-project-top-ten/)；[JWT Security Best Practices](https://curity.io/resources/learn/jwt-best-practices/)；[An Introduction to OAuth 2](https://www.digitalocean.com/community/tutorials/an-introduction-to-oauth-2)
- **官方文档**：[NestJS Security](https://docs.nestjs.com/security/authentication)；[Node.js Crypto API](https://nodejs.org/api/crypto.html)；[Passport.js Documentation](https://www.passportjs.org/)

### 🎤 月度分享主题

> **分享标题**：Node.js 应用安全加固指南 — 从认证设计到 OWASP 防御
>
> **核心内容**：① JWT 常见安全漏洞演示（alg:none 攻击、过期 Token 滥用）② OAuth2 授权码流程动画 ③ 现场攻防演练：演示 SQL 注入攻击团队项目再修复 ④ 安全 Checklist 发放
>
> **预计时长**：60 分钟

### ✅ 完成标准（Definition of Done）

- [ ] 认证系统通过 OWASP 认证测试，Refresh Token 轮换无泄漏，黑名单在 Redis 中可验证
- [ ] GitHub OAuth2 完整流程可演示，state 参数防 CSRF 机制有效
- [ ] 攻防演练中 5 种漏洞均有攻击成功截图和修复代码 PR
- [ ] 输出「NestJS 应用安全 Checklist」文档（至少 15 条检查项）
- [ ] `npm audit` 扫描项目无高危漏洞

---

## M08 — 测试与调试

### 🎯 本月目标

- 建立 NestJS 项目的完整测试体系：单元、集成、E2E 三层测试，覆盖率 > 85%
- 掌握 Jest 高级特性：Mock 模块、Spy、假定时器（Fake Timers）、快照测试
- 搭建 GitHub Actions CI 流水线：测试 → 覆盖率门禁 → 代码质量检查自动化
- 模拟并使用 `clinic.js` 排查一个真实内存泄漏，输出根本原因分析报告
- 掌握 Node.js CPU Profiling：生成火焰图，识别 Hot Function 并优化

### 📚 核心知识点

#### 1. 测试策略与金字塔
- 测试金字塔：单元测试（多）→ 集成测试（中）→ E2E 测试（少）的比例原则
- NestJS 测试工具：`@nestjs/testing` 的 `createTestingModule()`、`overrideProvider()`
- **单元测试**：隔离测试单个函数/类，Mock 所有外部依赖
- **集成测试**：测试模块间交互，使用内存数据库（SQLite / MongoDB-Memory-Server）
- **E2E 测试**：`supertest` 驱动完整 HTTP 请求，使用 Docker 启动真实数据库

#### 2. Jest 高级技巧
- `jest.mock()` 自动 Mock 模块 vs `jest.spyOn()` 监听方法调用
- `jest.useFakeTimers()`：控制 `setTimeout`、`setInterval`、`Date.now()`，测试定时逻辑
- 快照测试（Snapshot Testing）：API 响应结构的回归测试
- `describe.each()` / `it.each()`：数据驱动测试，减少重复代码
- Jest 配置优化：并行测试（`--maxWorkers`）、测试分片（`--shard`）、选择性运行

#### 3. 测试覆盖率
- 覆盖率指标：Statement、Branch、Function、Line 的含义与区别
- 覆盖率门禁：在 `jest.config.js` 中配置 `coverageThreshold`，低于阈值 CI 失败
- `lcov` 格式：生成可视化覆盖率报告，集成 Codecov / Coveralls
- 高覆盖率的陷阱：覆盖率 100% 不等于无 Bug，关键逻辑需要边界测试

#### 4. 调试技术
- `--inspect` 模式：附接 Chrome DevTools，断点调试异步代码
- VS Code 调试配置：`launch.json` 配置 NestJS 调试（TypeScript source map）
- `node --inspect-brk`：在第一行暂停，适合调试启动过程
- 调试 NestJS 依赖注入问题：环形依赖检测、Provider 未注册错误

#### 5. 性能诊断
- `clinic.js` 套件：`clinic doctor`（综合诊断）、`clinic flame`（火焰图）、`clinic bubbleprof`（async 分析）
- 内存泄漏排查：使用 `--expose-gc` + `process.memoryUsage()` 监控，`heapdump` 抓取堆快照
- Chrome DevTools Heap Snapshot：对比两次堆快照，找出增长的对象
- CPU 火焰图解读：识别宽栏（执行时间长）的函数，定位热点优化
- `0x` 工具：一键生成交互式火焰图

### 🛠️ 实践任务

- [ ] **项目完整测试套件**：为 M05/M06/M07 构建的 NestJS 项目补充完整测试，要求：单元测试覆盖所有 Service 方法、集成测试覆盖 Repository 层（使用 pg-in-memory 或 Docker）、E2E 测试覆盖所有 API 端点（含认证流程），总覆盖率 > 85%
- [ ] **GitHub Actions CI 流水线**：配置包含以下步骤的 CI：`npm ci` → `npm run lint` → `npm test --coverage` → 覆盖率门禁（< 85% 失败）→ `npm run build`，PR 合并前必须通过全部 CI 检查
- [ ] **内存泄漏排查实验**：编写 `memory-leak-demo.js`（故意引入 3 种典型内存泄漏：全局变量积累、EventEmitter 未移除监听器、闭包引用），使用 `clinic doctor` 诊断并定位，输出含堆快照对比图的根本原因分析报告

### 📖 推荐资源

- **书籍**：《JavaScript Testing Best Practices》— Yoni Goldberg (GitHub 开源)；《Node.js Design Patterns》— Chapter on Testing
- **文章/博客**：[JavaScript Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)；[clinic.js Documentation](https://clinicjs.org/)；[Node.js Memory Leak Detection](https://blog.appsignal.com/2020/05/06/a-deep-dive-into-node-js-memory.html)
- **官方文档**：[Jest Documentation](https://jestjs.io/docs/getting-started)；[NestJS Testing](https://docs.nestjs.com/fundamentals/testing)；[Node.js --inspect flag](https://nodejs.org/en/docs/guides/debugging-getting-started)

### 🎤 月度分享主题

> **分享标题**：Node.js 测试金字塔实践 — 如何写出让团队有信心的测试
>
> **核心内容**：① 测试金字塔分析：团队当前测试分布（通常是倒三角，E2E 偏多）及改进建议 ② Jest 高级 Mock 技巧现场演示 ③ 内存泄漏排查实验录屏回放（clinic doctor 诊断过程）④ CI 覆盖率门禁的配置 Demo
>
> **预计时长**：45 分钟

### ✅ 完成标准（Definition of Done）

- [ ] NestJS 项目测试覆盖率 > 85%（Branch 覆盖率 > 75%），CI 流水线绿色通过
- [ ] 内存泄漏实验报告包含：泄漏原因说明、堆快照对比截图、修复 PR
- [ ] 能用 Chrome DevTools 附接到运行中的 NestJS 进程进行断点调试
- [ ] GitHub Actions CI 在 PR 中自动评论覆盖率报告
- [ ] 输出「团队测试规范」文档：命名约定、Mock 策略、测试数据管理

---

## M09 — 性能优化与监控

### 🎯 本月目标

- 构建 Prometheus + Grafana 监控体系，覆盖 Event Loop 延迟、内存、GC 等核心指标
- 实现 Worker Threads 池，将 CPU 密集型任务（图像处理/加密）从主线程卸载
- 集成 OpenTelemetry 实现分布式链路追踪（Trace ID 跨服务传播）
- 使用 `autocannon` 压测识别系统瓶颈，输出包含优化前后对比的调优报告
- 建立结构化日志体系（`pino`）：日志级别管理、日志聚合、慢查询告警

### 📚 核心知识点

#### 1. 性能指标与监控
- **Event Loop Lag**（ELL）：最重要的 Node.js 健康指标，`perf_hooks.monitorEventLoopDelay()`
- **内存指标**：`heapUsed`、`heapTotal`、`external`、`rss` 的含义与告警阈值
- **GC 指标**：通过 `--expose-gc` + `PerformanceObserver` 追踪 GC 频率和耗时
- **HTTP 延迟百分位**：P50/P95/P99 的区别，P99 > 200ms 时的排查思路
- `prom-client`：Node.js Prometheus 客户端，默认指标 + 自定义业务指标

#### 2. Prometheus + Grafana 监控栈
- Prometheus 数据模型：Counter、Gauge、Histogram、Summary 四种指标类型
- Grafana Dashboard：导入 Node.js 官方 Dashboard（ID: 11159），自定义业务面板
- AlertManager：配置告警规则（内存 > 80%、ELL > 50ms），Slack/Email 通知
- NestJS 集成：`@willsoto/nestjs-prometheus` 自动暴露 `/metrics` 端点

#### 3. Worker Threads
- 主线程 vs Worker 线程：共享内存（`SharedArrayBuffer`）、消息传递（`postMessage`）
- `workerData` 与 `parentPort`：初始化数据传递与双向通信
- Worker Threads 池：`workerpool` 或自实现，避免线程创建开销
- `Atomics`：多线程同步原语（`Atomics.wait()`/`Atomics.notify()`）
- 适用场景：图像处理、CPU 密集型计算、`bcrypt` 哈希、视频转码

#### 4. 分布式追踪（OpenTelemetry）
- OpenTelemetry 三大支柱：Traces（链路）、Metrics（指标）、Logs（日志）
- Span 与 Trace：跨越多个服务的 TraceId，单个操作的 SpanId
- 自动埋点（Auto Instrumentation）：`@opentelemetry/auto-instrumentations-node` 自动追踪 HTTP、数据库调用
- 手动 Span：为业务关键逻辑添加自定义追踪
- 导出到 Jaeger / Tempo：可视化调用链分析

#### 5. 结构化日志与慢查询
- `pino`：最快的 Node.js 日志库（比 `winston` 快 5x），JSON 结构化输出
- 日志级别策略：生产环境 `info` 级别，通过环境变量动态调整
- 慢查询检测：Prisma 的 `$on('query')` 钩子，记录执行时间 > 100ms 的查询
- 日志聚合：Loki + Grafana，关联 Trace ID 从日志跳转到追踪视图

### 🛠️ 实践任务

- [ ] **监控体系搭建**：用 Docker Compose 启动 Prometheus + Grafana + AlertManager，配置 NestJS 应用的 `/metrics` 端点，在 Grafana 中实现：Event Loop Lag 趋势图、内存堆使用图、HTTP 请求 P99 延迟图、GC 暂停时间图，配置 ELL > 50ms 触发 Slack 告警
- [ ] **Worker Threads 图像处理服务**：实现 NestJS 上传图片 → Worker Thread 处理（缩略图生成 + 水印添加）→ 返回处理后图片的端到端流程，使用 `autocannon` 对比「主线程处理」vs「Worker Thread 处理」的吞吐量差异（应 > 3x）
- [ ] **OpenTelemetry 链路追踪**：在 NestJS 应用中集成 OpenTelemetry，实现 HTTP 请求 → Service → Repository → Redis/PostgreSQL 的全链路 Trace，在 Jaeger UI 中能看到完整调用树，包含每个 Span 的耗时和自定义 Attribute

### 📖 推荐资源

- **书籍**：《Site Reliability Engineering》— Google SRE Book (免费在线)；《Distributed Systems Observability》— Cindy Sridharan (O'Reilly 免费)
- **文章/博客**：[Node.js Performance Monitoring](https://sematext.com/blog/node-js-performance-monitoring/)；[clinic.js Guide](https://clinicjs.org/documentation/)；[OpenTelemetry Node.js Getting Started](https://opentelemetry.io/docs/instrumentation/js/getting-started/nodejs/)
- **官方文档**：[Prometheus Metrics Types](https://prometheus.io/docs/concepts/metric_types/)；[prom-client Node.js](https://github.com/siimon/prom-client)；[OpenTelemetry Node.js](https://opentelemetry.io/docs/instrumentation/js/)

### 🎤 月度分享主题

> **分享标题**：Node.js 性能优化实战 — 从发现瓶颈到解决问题的完整链路
>
> **核心内容**：① Grafana 监控大盘现场演示（Event Loop Lag 告警模拟）② Worker Threads 处理 CPU 密集任务的性能对比数据 ③ OpenTelemetry 调用链追踪 Demo（从 HTTP 请求追踪到 SQL 查询）④ 性能调优方法论：测量 → 假设 → 验证 → 记录
>
> **预计时长**：50 分钟

### ✅ 完成标准（Definition of Done）

- [ ] Grafana Dashboard 包含 4 个核心面板，ELL 告警在模拟压力下能正确触发 Slack 通知
- [ ] Worker Threads 方案在 autocannon 压测中，吞吐量比主线程方案高 > 3x，主线程 ELL < 50ms
- [ ] Jaeger UI 中能看到完整的跨层调用链（HTTP → NestJS → Prisma → PostgreSQL），SpanId 完整
- [ ] `pino` 日志中包含 TraceId 字段，可从 Grafana Loki 跳转到对应的 Jaeger Trace
- [ ] 输出「NestJS 应用性能调优 Checklist」（至少 10 条优化项，含量化指标）

---

## ══════════════════════════════════════
## 第四阶段：架构与实战 (M10–M12)
## ══════════════════════════════════════

---

## M10 — 微服务架构

### 🎯 本月目标

- 构建包含 3 个 NestJS 微服务（用户、订单、通知）+ API Gateway 的完整微服务 Demo，覆盖 REST + gRPC + MQ 三种通信方式
- 实现 Saga 分布式事务模式（Choreography-based），保证跨服务数据一致性
- 构建 API Gateway：统一认证、限流、路由、日志聚合
- 实现基于 Kafka 的事件驱动架构，理解 Event Sourcing 和 CQRS 模式
- 评估微服务引入的复杂度成本，形成「何时该用微服务」的决策框架

### 📚 核心知识点

#### 1. 微服务架构模式
- 微服务 vs 单体 vs Serverless 的权衡：团队规模、部署频率、技术异构性
- 服务边界划分：领域驱动设计（DDD）中的限界上下文（Bounded Context）
- 数据库独立：每个微服务拥有独立数据库，禁止跨服务直接查询数据库
- 服务发现：客户端发现（Consul / etcd）vs 服务端发现（Load Balancer）
- NestJS Microservices 模块：`ClientsModule.register()`，支持多种传输层

#### 2. NestJS 微服务通信

**REST + API Gateway**
- API Gateway 模式：统一入口，内部使用 HTTP/gRPC 与下游服务通信
- `@nestjs/axios` 服务间 HTTP 调用，配置超时、重试、熔断
- 服务注册与负载均衡：Kubernetes Service + DNS 轮询

**gRPC**
- Protocol Buffers（`.proto` 文件）：定义消息类型和服务接口
- NestJS gRPC Transport：`@GrpcMethod()` 装饰器，双向流（Bidirectional Streaming）
- gRPC vs REST 性能对比：二进制序列化的速度优势（约 5-10x）
- `grpc-gateway`：将 gRPC 服务暴露为 REST API

**消息队列（MQ）**
- RabbitMQ：`amqplib`，Exchange 类型（Direct/Topic/Fanout），消息确认（ACK/NACK）
- Kafka：`kafkajs`，分区（Partition）、消费者组（Consumer Group）、偏移量（Offset）管理
- BullMQ（Redis）：适合任务队列；Kafka 适合事件流；RabbitMQ 适合复杂路由

#### 3. 分布式事务（Saga 模式）
- Saga 编排式（Orchestration）：中央协调者（Saga Orchestrator）控制流程
- Saga 编排式（Choreography）：各服务监听事件，自主决定下一步
- 补偿事务（Compensating Transaction）：每个步骤有对应的回滚操作
- 幂等性（Idempotency）：消息重复消费时不产生副作用（`messageId` 去重）

#### 4. 事件驱动架构
- Event Sourcing：存储事件而非状态，从事件重建当前状态
- CQRS（命令查询职责分离）：写模型（Command）与读模型（Query）分离，读模型可维护多个投影
- Outbox Pattern：解决数据库写入与消息发送的原子性问题（事务性消息）
- Dead Letter Queue（DLQ）：处理无法消费的消息，防止消息丢失

#### 5. 可观测性与弹性
- 熔断器（Circuit Breaker）：`opossum` 库，防止级联故障
- 重试与幂等：带指数退避的重试策略，配合消息幂等性
- 分布式追踪：OpenTelemetry TraceId 在服务间通过 HTTP Header / gRPC Metadata 传播
- 健康检查：`@nestjs/terminus` 实现 `/health` 端点，K8s 存活/就绪探针

### 🛠️ 实践任务

- [ ] **构建微服务 Demo（3 服务 + Gateway）**：
  - `user-service`（NestJS + PostgreSQL）：用户注册/登录/查询，gRPC 接口
  - `order-service`（NestJS + MongoDB）：订单创建/查询，REST API + 发布 Kafka 事件
  - `notification-service`（NestJS）：订阅 Kafka `order.created` 事件，发送模拟邮件
  - `api-gateway`（NestJS）：统一入口，JWT 验证，路由到下游服务
  - Saga：订单创建 → 扣库存 → 扣款，任一步骤失败触发补偿事务
- [ ] **gRPC 服务间通信**：在 `api-gateway` 与 `user-service` 之间实现 gRPC 通信，定义 `.proto` 文件，实现 `GetUser`、`ValidateToken` 两个 RPC 方法，对比相同接口 REST vs gRPC 的 P99 延迟（至少 100 次调用）
- [ ] **Kafka 事件驱动**：实现订单创建时的完整事件链，模拟消费者宕机重启后消息的 Replay 能力，验证幂等性（同一 OrderId 只发一次邮件）

### 📖 推荐资源

- **书籍**：《Building Microservices》(2nd Ed.) — Sam Newman；《Designing Distributed Systems》— Brendan Burns (免费下载)
- **文章/博客**：[NestJS Microservices](https://docs.nestjs.com/microservices/basics)；[CQRS & Event Sourcing](https://martinfowler.com/bliki/CQRS.html)；[The Saga Pattern](https://microservices.io/patterns/data/saga.html)
- **官方文档**：[NestJS Microservices](https://docs.nestjs.com/microservices/basics)；[kafkajs Documentation](https://kafka.js.org/docs/getting-started)；[gRPC Node.js](https://grpc.io/docs/languages/node/)

### 🎤 月度分享主题

> **分享标题**：Node.js 微服务架构实践 — REST + gRPC + Kafka 的边界在哪里
>
> **核心内容**：① 微服务 Demo 架构图讲解与现场演示 ② REST vs gRPC 延迟对比数据 ③ Kafka 消费者重启后消息 Replay 演示 ④ Saga 补偿事务动画（订单创建失败的全链路回滚）⑤「何时该用微服务」决策树
>
> **预计时长**：60 分钟

### ✅ 完成标准（Definition of Done）

- [ ] 4 个服务（含 API Gateway）用 Docker Compose 一键启动，端到端流程（下单 → 扣库存 → 发通知）可演示
- [ ] gRPC P99 延迟 < REST P99 延迟的 50%（在局域网内）
- [ ] Kafka 消费者重启后能从上次 offset 继续消费，同一消息不重复处理（幂等验证）
- [ ] Saga 失败场景：模拟扣款失败，能验证库存回滚成功
- [ ] 输出「微服务选型决策框架」文档，包含 5 个判断维度

---

## M11 — DevOps 与部署

### 🎯 本月目标

- 构建生产级多阶段 Dockerfile，镜像体积 < 100MB，启动时间 < 5s
- 配置 Kubernetes 部署（Deployment + Service + HPA + ConfigMap + Secret），实现水平自动扩缩容
- 搭建 GitHub Actions CI/CD 流水线：测试 → 构建镜像 → 推送镜像仓库 → 自动部署到 K8s
- 实现优雅关闭（Graceful Shutdown）：零停机滚动部署（Rolling Update）
- 实现蓝绿部署和金丝雀发布，通过 Istio Service Mesh 实现流量权重控制

### 📚 核心知识点

#### 1. Docker 深入
- 多阶段构建（Multi-stage Build）：`builder` 阶段编译 TypeScript，`production` 阶段仅复制产物
- 镜像层缓存优化：`COPY package*.json .` 在 `npm ci` 之前，避免依赖层缓存失效
- 非 root 用户运行：安全最佳实践，`USER node`
- `.dockerignore`：排除 `node_modules`、`.env`、测试文件
- Docker BuildKit：并行构建层，`--mount=type=cache` 缓存 npm 包

#### 2. Kubernetes 部署
- 核心对象：`Deployment`（副本集管理）、`Service`（服务发现）、`Ingress`（HTTP 路由）、`ConfigMap`/`Secret`（配置管理）
- 健康探针：`livenessProbe`（存活，失败则重启）、`readinessProbe`（就绪，失败则移出 LB）、`startupProbe`（启动保护）
- HPA（Horizontal Pod Autoscaler）：基于 CPU/Memory 或自定义指标（Event Loop Lag）自动扩缩容
- 滚动更新策略：`maxSurge` 和 `maxUnavailable` 配置，零停机部署
- 资源限制：`requests` 和 `limits` 的配置，OOMKilled vs Throttled 的区别

#### 3. 优雅关闭（Graceful Shutdown）
- 信号处理：`SIGTERM` 触发优雅关闭，K8s 发送 SIGTERM 后等待 `terminationGracePeriodSeconds`
- 关闭序列：停止接受新请求 → 等待进行中请求完成 → 关闭数据库连接 → 退出
- NestJS `enableShutdownHooks()`：自动注册 `OnModuleDestroy` 钩子
- 连接排空（Connection Draining）：`server.close()` + 追踪活跃请求数

#### 4. CI/CD 流水线（GitHub Actions）
- 工作流结构：`on: pull_request` 触发测试，`on: push: branches: main` 触发部署
- 矩阵测试（Matrix Strategy）：同时在 Node.js 18、20、22 上运行测试
- 镜像构建与推送：`docker/build-push-action`，推送到 GHCR（GitHub Container Registry）
- Kubernetes 部署：`kubectl set image` 更新 Deployment，等待 `rollout status`
- Secret 管理：GitHub Actions Secrets → K8s Secrets 的安全传递

#### 5. 高级部署策略
- 蓝绿部署（Blue-Green）：同时运行两个版本，切换 Service 选择器实现秒级切换
- 金丝雀发布（Canary）：逐步将 5% → 20% → 50% → 100% 流量切换到新版本
- Istio Service Mesh：基于 `VirtualService` 权重路由、故障注入测试、mTLS 服务间加密
- Feature Flags：`flagsmith` 或 `unleash` 实现功能开关，与 Canary 配合

### 🛠️ 实践任务

- [ ] **生产级 Dockerfile**：为 M10 的微服务编写多阶段 Dockerfile，要求：最终镜像基于 `node:20-alpine`，体积 < 100MB，非 root 用户运行，`.dockerignore` 完整，通过 `trivy` 安全扫描无高危漏洞
- [ ] **K8s 完整部署配置**：编写 K8s YAML（或 Helm Chart），包含：Deployment（3 副本）、Service、Ingress（带 TLS）、ConfigMap（应用配置）、Secret（数据库密码/JWT 密钥）、HPA（CPU > 70% 触发扩容，最大 10 副本），在本地 minikube 上验证滚动更新和自动扩缩容
- [ ] **GitHub Actions 完整 CI/CD**：配置端到端 CI/CD 流水线：PR → 测试（含覆盖率门禁）→ 构建 Docker 镜像 → 推送到 GHCR → 更新 K8s Deployment → Slack 部署通知，整个流水线耗时 < 10 分钟

### 📖 推荐资源

- **书籍**：《Kubernetes in Action》(2nd Ed.) — Marko Luksa；《The DevOps Handbook》— Gene Kim
- **文章/博客**：[Docker Best Practices for Node.js](https://snyk.io/blog/10-best-practices-to-containerize-nodejs-web-applications-with-docker/)；[Kubernetes Deployment Strategies](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#strategy)；[GitHub Actions for Node.js](https://docs.github.com/en/actions/automating-builds-and-tests/building-and-testing-nodejs)
- **官方文档**：[Kubernetes Documentation](https://kubernetes.io/docs/)；[GitHub Actions](https://docs.github.com/en/actions)；[Docker Documentation](https://docs.docker.com/)

### 🎤 月度分享主题

> **分享标题**：Node.js 从代码到生产 — Docker + K8s + CI/CD 一站式部署指南
>
> **核心内容**：① 多阶段 Dockerfile 优化前后镜像体积对比（从 1.2GB 到 < 100MB）② K8s 滚动更新零停机演示（模拟请求持续发送，观察无错误响应）③ HPA 自动扩缩容触发演示（autocannon 压测 → Pod 数量变化）④ GitHub Actions 流水线全程演示
>
> **预计时长**：55 分钟

### ✅ 完成标准（Definition of Done）

- [ ] Docker 镜像体积 < 100MB（`node:20-alpine` 基础），`trivy` 扫描无高危漏洞
- [ ] K8s 滚动更新过程中，持续发送的请求错误率 = 0（优雅关闭验证）
- [ ] HPA 在 minikube 中能自动触发扩缩容，Pod 数量变化可观测
- [ ] GitHub Actions 流水线全程 < 10 分钟，PR Merge 后 5 分钟内新版本在 K8s 中运行
- [ ] 输出「Node.js 生产部署 Checklist」文档（至少 20 条检查项）

---

## M12 — 综合项目实战

### 🎯 本月目标

- 综合运用全年所学，独立设计并实现一个生产就绪的完整系统
- 完成完整的架构设计文档（ADR、系统设计图、API 文档）
- 实现 > 85% 测试覆盖率 + 完整 CI/CD + K8s 部署 + 监控告警
- 进行年度知识体系回顾，识别薄弱环节制定下一年深化计划
- 完成全年最后一次团队分享：项目 Demo + 技术总结 + 团队建议

### 📚 综合项目选题（三选一）

#### 选题 A：高并发实时协作文档系统
> 技术重点：WebSocket + CRDT 算法 + Redis Pub/Sub + 微服务
> 核心功能：多人实时编辑、版本历史、冲突解决、评论与提及通知

#### 选题 B：企业级任务调度与执行平台
> 技术重点：BullMQ + Kafka + NestJS 微服务 + K8s CronJob
> 核心功能：可视化任务配置（Cron 表达式）、分布式执行（多 Worker）、失败重试、执行历史、告警

#### 选题 C：API 聚合网关（BFF 层）
> 技术重点：NestJS + GraphQL + RESTful 聚合 + 限流 + 可观测性
> 核心功能：统一多个后端 API（REST/gRPC）为 GraphQL 接口、DataLoader 解决 N+1、请求缓存、访问控制

### 📚 核心知识点

#### 1. 系统设计能力
- 需求分析：功能性需求 vs 非功能性需求（并发量、SLA、数据量）
- 架构决策记录（ADR）：每个关键技术决策的背景、选项、结论、后果
- 容量估算：DAU × 操作频率 → QPS → 数据库/缓存/带宽容量
- 单点故障识别：每个组件的 SPOF 分析，如何实现 HA（高可用）

#### 2. 代码质量
- TypeScript 严格模式：`strict: true`，消除隐式 `any`，完善类型定义
- SOLID 原则在 NestJS 中的应用：单一职责的 Service、依赖倒置的 Repository 模式
- Clean Architecture：Domain Layer（纯业务逻辑）→ Application Layer → Infrastructure Layer
- 代码 Review 清单：可读性、可测试性、安全性、性能隐患

#### 3. 项目文档化
- README.md：项目介绍、快速启动（< 5 条命令）、架构图、环境变量说明
- API 文档：Swagger/OpenAPI 自动生成，包含请求/响应示例
- 架构图：C4 模型（Context → Container → Component）
- Runbook：常见故障的排查步骤（服务不可用、内存泄漏、慢查询）

#### 4. 性能基准
- 压力测试：`autocannon` 输出 RPS、P99 延迟、错误率，与目标 SLA 对比
- 内存稳定性：连续压测 30 分钟，内存增长 < 10%（无内存泄漏）
- 数据库瓶颈验证：慢查询日志分析，关键查询 P99 < 50ms

#### 5. 年度总结框架
- 技术雷达：本年度新掌握的技术（Adopt/Trial/Assess/Hold）
- 薄弱环节：哪些月份的知识储备不足，需要下一年继续深化
- 团队影响：本年度技术分享对团队能力提升的量化评估
- 下一年计划：Serverless / Rust + WASM / AI 集成等方向预研

### 🛠️ 实践任务

- [ ] **完整系统实现**：按选题完成全部功能，代码托管于 GitHub（Public 仓库），README 从克隆到运行 < 5 条命令，Swagger 文档覆盖所有 API 端点
- [ ] **生产级部署**：Docker Compose（本地开发）+ K8s（生产模拟），配套 GitHub Actions CI/CD，Prometheus + Grafana 监控大盘（包含业务指标），`autocannon` 压测报告（目标：> 500 RPS，P99 < 200ms）
- [ ] **年度知识图谱**：制作一张「Node.js 技术全景图」（可视化），标注自己在每个知识点的掌握程度（1-5星），并列出 3 个下一年度重点深化的方向

### 📖 推荐资源

- **书籍**：《Clean Architecture》— Robert C. Martin；《System Design Interview》— Alex Xu
- **文章/博客**：[System Design Primer (GitHub)](https://github.com/donnemartin/system-design-primer)；[The Twelve-Factor App](https://12factor.net/)；[NestJS Real World Example](https://github.com/lujakob/nestjs-realworld-example-app)
- **官方文档**：本月以综合实践为主，优先查阅前 11 个月积累的笔记和官方文档

### 🎤 月度分享主题

> **分享标题**：Node.js 一年深入学习总结 — 从原理到架构的蜕变之路
>
> **核心内容**：① 综合项目 Live Demo（5 分钟核心功能演示）② 架构设计决策回顾（3 个最难的技术选型）③ 全年知识体系图谱展示 ④ 团队 Node.js 技术能力提升建议 + 下一年技术规划
>
> **预计时长**：60 分钟

### ✅ 完成标准（Definition of Done）

- [ ] 综合项目 GitHub 仓库包含完整代码、README、架构图（Public 仓库）
- [ ] 项目测试覆盖率 > 85%，CI/CD 绿色，K8s 部署可演示
- [ ] `autocannon` 压测达成 > 500 RPS，P99 < 200ms 的目标
- [ ] 年度知识图谱完成，识别出至少 3 个薄弱环节并制定强化计划
- [ ] 完成年度复盘文章（发布至掘金/InfoQ/公司技术博客）

---

## 📊 附录：全年知识体系图谱

```
Node.js 技术图谱
│
├── 底层原理
│   ├── V8 引擎（JIT、隐藏类、GC）
│   ├── libuv（事件循环、线程池）
│   └── 模块系统（CJS/ESM）
│
├── 异步模型
│   ├── Promise/A+ 规范
│   ├── async/await 原理
│   └── 并发控制 + AsyncLocalStorage
│
├── 数据处理
│   ├── Buffer（零拷贝）
│   └── Stream（背压机制）
│
├── 网络层
│   ├── HTTP/1.1 → HTTP/3
│   ├── WebSocket
│   └── TLS/SSL
│
├── Web 框架
│   ├── NestJS（DI + AOP）
│   └── Express/Koa/Fastify（对比）
│
├── 数据存储
│   ├── PostgreSQL + Prisma
│   ├── MongoDB + Mongoose
│   └── Redis（缓存/锁/队列）
│
├── 安全
│   ├── JWT + OAuth2
│   ├── RBAC/ABAC
│   └── OWASP Top 10
│
├── 测试
│   ├── Jest（单元/集成/E2E）
│   └── 性能诊断（clinic.js）
│
├── 可观测性
│   ├── Prometheus + Grafana
│   ├── OpenTelemetry（链路追踪）
│   └── pino（结构化日志）
│
├── 微服务
│   ├── REST + API Gateway
│   ├── gRPC
│   ├── Kafka / RabbitMQ / BullMQ
│   └── Saga / CQRS / Event Sourcing
│
└── DevOps
    ├── Docker（多阶段构建）
    ├── Kubernetes（HPA/滚动更新）
    └── GitHub Actions CI/CD
```

---

## 📈 进度追踪

| 月份 | 计划完成日期 | 实际完成日期 | 实践任务数 | 分享日期 | 备注 |
|------|------------|------------|----------|---------|------|
| M01  | 2025-02-28 | 2025-02-28 | 4 | 2025-02-XX | ✅ |
| M02  | 2025-03-31 | 2025-03-31 | 3 | 2025-03-XX | ✅ |
| M03  | 2025-04-30 | 2025-04-30 | 3 | 2025-04-XX | ✅ |
| M04  | 2025-05-31 | 2025-05-31 | 3 | 2025-05-XX | ✅ |
| M05  | 2025-06-30 | 2025-06-30 | 3 | 2025-06-XX | ✅ |
| M06  | 2025-07-31 | 2025-07-31 | 3 | 2025-07-XX | ✅ |
| M07  | 2025-08-31 | 2025-08-31 | 3 | 2025-08-XX | ✅ |
| M08  | 2025-09-30 | 2025-09-30 | 3 | 2025-09-XX | ✅ |
| M09  | 2025-10-31 | 2025-10-31 | 3 | 2025-10-XX | ✅ |
| M10  | 2025-11-30 | 2025-11-30 | 3 | 2025-11-XX | ✅ |
| M11  | 2025-12-31 | 2025-12-31 | 3 | 2025-12-XX | ✅ |
| M12  | 2026-01-31 | 2026-01-31 | 3 | 2026-01-XX | ✅ |
