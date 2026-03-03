# Month 08 — 测试与调试

## 学习目标

掌握 Jest 高级用法、集成测试模式以及 Node.js 内存泄漏的排查方法。

---

## 进度追踪

| # | 任务 | 类型 | 状态 | 完成日期 |
|---|------|------|------|---------|
| 1 | 阅读 jest-advanced.md | 笔记 | ⬜ | |
| 2 | 阅读 integration-testing.md | 笔记 | ⬜ | |
| 3 | 阅读 debugging-and-profiling.md | 笔记 | ⬜ | |
| 4 | 运行 demo-memory-leak.js | 实践 | ⬜ | |
| 5 | 运行 demo-jest-patterns.js | 实践 | ⬜ | |
| 6 | 运行 demo-cpu-profile.js | 实践 | ⬜ | |
| 7 | 完成月度分享 slides.md | 输出 | ⬜ | |

---

## 核心概念速览

```
内存泄漏三大模式:
  1. 事件监听器累积 (EventEmitter leak)
  2. 闭包持有引用 (closure retains reference)
  3. 无限增长的缓存 (unbounded cache)

排查工具:
  node --inspect → Chrome DevTools → Memory tab → Heap Snapshot
```

## 参考资料

- [Jest 官方文档](https://jestjs.io/docs/getting-started)
- [Node.js Inspector](https://nodejs.org/en/docs/guides/debugging-getting-started)
- [Clinic.js](https://clinicjs.org/)
- [node:v8 模块文档](https://nodejs.org/api/v8.html)
