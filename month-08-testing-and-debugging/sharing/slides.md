# 第八月分享：测试与调试的艺术 — 从 Jest 到内存泄漏排查

---

## Slide 1 — 封面

```
测试与调试的艺术
从 Jest Mock 到内存泄漏排查

Month 08 · Node.js Deep Dive
```

🗣️ 大家好！今天讲的是让代码可信赖的两件事：测试 + 调试。
**互动：大家有没有遇到过线上才发现的 bug，当时是怎么排查的？**

---

## Slide 2 — 测试金字塔

```
        E2E       ← 少量，慢，高置信
       集成测试    ← 中量，测 API + DB
      单元测试     ← 大量，快，mock 依赖

❓ 什么时候用 Mock？
  → 替换慢/不稳定的外部依赖（数据库、HTTP、时间）
  
❓ 什么时候用真实依赖？
  → 集成测试验证真实交互
```

🗣️ Mock 越多，测试越快但置信度越低；找到平衡点。

---

## Slide 3 — jest.mock vs jest.spyOn

```javascript
// jest.mock：替换整个模块
jest.mock('./emailService');
emailService.send.mockResolvedValue({ messageId: '001' });
expect(emailService.send).toHaveBeenCalledTimes(1);

// jest.spyOn：监听真实方法
const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
// ... 执行代码 ...
expect(spy).not.toHaveBeenCalled();
spy.mockRestore();
```

🗣️ 演示 `demo-jest-patterns.js`。

---

## Slide 4 — 内存泄漏 4 大原因

```
1. 无界缓存    const cache = {}  → 用 LRU Map
2. EventEmitter 
   emitter.on('data', fn)       → 用 once / off
3. 闭包引用大对象               → 只保留需要的值
4. Timer 未清理                 → 销毁时 clearInterval

诊断方法:
  process.memoryUsage()   ← 监控趋势
  node --inspect          ← Heap Snapshot
  v8.writeHeapSnapshot()  ← 手动快照
```

🗣️ 演示 `demo-memory-leak.js`，观察内存变化。

---

## Slide 5 — CPU 热点分析

```bash
# 1. 生成 CPU profile
node --prof app.js

# 2. 分析（文字报告）
node --prof-process isolate-*.log > profile.txt

# 3. 火焰图（推荐）
npm install -g clinic
clinic flame -- node app.js
```

🗣️ 演示 `demo-cpu-profile.js`，对比字符串拼接和数组操作。

---

## Slide 6 — 下月预告：性能优化

```
Month 09: Node.js 性能优化实战
  Worker Threads（CPU 密集型任务）
  缓存策略（LRU、TTL、Cache-aside）
  Prometheus + Grafana 可观测性
  性能基准测试（autocannon）
```

🗣️ **提问：大家项目里哪个接口最慢？有没有用 Worker 线程处理过 CPU 密集任务？**
