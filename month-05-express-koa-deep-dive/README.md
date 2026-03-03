# Month 05 — Express/Koa/NestJS 深度对比

## 学习目标

理解现代 Node.js 框架的本质：**中间件模式**与**依赖注入**。

---

## 进度追踪

| # | 任务 | 类型 | 状态 | 完成日期 |
|---|------|------|------|---------|
| 1 | 阅读 express-middleware.md | 笔记 | ⬜ | |
| 2 | 阅读 koa-onion-model.md | 笔记 | ⬜ | |
| 3 | 阅读 nestjs-di.md | 笔记 | ⬜ | |
| 4 | 运行 demo-mini-express.js | 实践 | ⬜ | |
| 5 | 运行 demo-koa-compose.js | 实践 | ⬜ | |
| 6 | 运行 demo-nestjs-di.js | 实践 | ⬜ | |
| 7 | 完成月度分享 slides.md | 输出 | ⬜ | |

---

## 核心概念速览

```
Express 中间件链（线形）:
  req → mw1 → mw2 → route → res

Koa 洋葱模型（嵌套）:
  req → mw1.before → mw2.before → route → mw2.after → mw1.after → res

NestJS DI 容器:
  @Module 声明 providers → IoC Container 解析依赖树 → 注入到 @Controller/@Injectable
```

## 参考资料

- [Express 4.x API](https://expressjs.com/en/4x/api.html)
- [Koa 源码](https://github.com/koajs/koa/blob/master/lib/application.js)
- [NestJS 官方文档](https://docs.nestjs.com)
- [koa-compose 源码](https://github.com/koajs/compose/blob/master/index.js)（仅 37 行！）
