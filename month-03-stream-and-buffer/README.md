# Month 03 — Stream & Buffer

> **学习周期**：第 9 ~ 12 周  
> **核心主题**：Buffer 内存模型、4 种 Stream 类型、背压机制、Pipeline 工具链  
> **技术栈**：Node.js Stream API v20+、`stream/promises`、CSV 实战

---

## 任务进度

| # | 任务 | 类型 | 状态 | 完成日期 |
|---|------|------|------|----------|
| 1 | Buffer 内存结构与 TypedArray 关系 | 笔记 | ⬜ | — |
| 2 | 4 种 Stream 类型与使用场景 | 笔记 | ⬜ | — |
| 3 | 背压（Backpressure）机制 | 笔记 | ⬜ | — |
| 4 | Demo：CSV Transform Stream | 脚本 | ⬜ | — |
| 5 | Demo：背压实验（模拟慢消费者） | 脚本 | ⬜ | — |
| 6 | Demo：stream/promises pipeline | 脚本 | ⬜ | — |
| 7 | 月度分享 slides 制作 | 分享 | ⬜ | — |

---

## 目录结构

```
month-03-stream-and-buffer/
├── README.md
├── notes/
│   ├── buffer-internals.md          # Buffer 底层原理
│   ├── stream-types.md              # 4 种流类型解析
│   ├── backpressure.md              # 背压与 highWaterMark
│   └── scripts/
│       ├── demo-csv-transform.js    # CSV 转换流
│       ├── demo-backpressure.js     # 背压演示
│       └── demo-pipeline.js        # pipeline API
└── sharing/
    └── slides.md
```

---

## 学习资源

- [Node.js Stream 官方文档](https://nodejs.org/api/stream.html)
- [Node.js Buffer 官方文档](https://nodejs.org/api/buffer.html)
- [Stream Handbook（substack）](https://github.com/substack/stream-handbook)
- [Streams — Ivan Vanderbyl](https://www.youtube.com/watch?v=MCRXGjNITOA)
