# Month 02 — 异步编程深入

## 📅 时间：2025年3月

## 🎯 本月目标

- 实现符合 Promise/A+ 规范的 `MyPromise`，理解微任务队列调度
- 分析 `async/await` 与 Generator + Promise 的等价关系
- 构建并发控制工具库，解决并发爆炸、背压失控问题
- 掌握 `AsyncLocalStorage` 实现请求级上下文传递
- 建立异步错误处理完整策略

## 📝 学习进度

| 任务                          | 状态 | 完成日期 |
| ----------------------------- | ---- | -------- |
| Promise/A+ 规范研读           | ⬜   |          |
| 手写 MyPromise（872 测试通过）| ⬜   |          |
| async/await 编译产物分析      | ⬜   |          |
| 实现并发控制器（p-limit 原理）| ⬜   |          |
| AsyncLocalStorage 链路追踪    | ⬜   |          |
| 异步错误处理最佳实践          | ⬜   |          |
| 分享 PPT 准备                 | ⬜   |          |

## 📂 目录结构

```
month-02-async-programming/
├── README.md
├── notes/
│   ├── promise-deep-dive.md      # Promise/A+ 规范与实现原理
│   ├── async-await-internals.md  # async/await 底层：Generator + 自动执行器
│   ├── concurrency-control.md    # 并发控制：串行/并行/限流/队列
│   └── scripts/
│       ├── demo-my-promise.js          # 手写 Promise/A+ 实现
│       ├── demo-concurrent-limiter.js  # 并发控制器实现
│       └── demo-async-local-storage.js # AsyncLocalStorage 链路追踪
└── sharing/
    └── slides.md
```

## 🔗 参考资源

- [Promises/A+ Specification](https://promisesaplus.com/)
- [You Don't Know JS: Async & Performance](https://github.com/getify/You-Dont-Know-JS/blob/1st-ed/async%20%26%20performance/README.md)
- [Node.js AsyncLocalStorage](https://nodejs.org/api/async_context.html)
- [Node.js Async Hooks](https://nodejs.org/api/async_hooks.html)
