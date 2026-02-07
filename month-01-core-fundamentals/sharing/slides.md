# 🎤 团队分享：揭秘 Node.js 事件循环

> 分享人：XXX | 日期：2025-02-XX | 时长：45min

---

## 📋 大纲

1. 为什么要理解 Event Loop？（5min）
2. V8 与 libuv 的关系（10min）
3. Event Loop 六阶段详解（15min）
4. 经典面试题现场挑战（10min）
5. 对我们项目的启示（5min）

---

## 1. 为什么要理解 Event Loop？

### 真实案例

```js
// 你觉得输出顺序是什么？
setTimeout(() => console.log('timeout'), 0);
setImmediate(() => console.log('immediate'));
process.nextTick(() => console.log('nextTick'));
Promise.resolve().then(() => console.log('promise'));
console.log('main');
```
