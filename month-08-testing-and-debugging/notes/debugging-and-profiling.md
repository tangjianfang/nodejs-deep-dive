# Node.js 调试与性能分析

## 1. --inspect 调试

```bash
# 启动调试模式
node --inspect app.js             # 监听 localhost:9229
node --inspect=0.0.0.0:9229 app.js # 允许远程连接
node --inspect-brk app.js         # 在第一行暂停（调试启动问题）

# Chrome DevTools: chrome://inspect
# VSCode: launch.json
{
  "type": "node",
  "request": "attach",
  "port": 9229,
  "restart": true
}
```

---

## 2. 内存泄漏诊断

### 2.1 常见泄漏模式

```javascript
// ❌ 泄漏 1：全局缓存无上限
const cache = {};
function getUser(id) {
  if (!cache[id]) cache[id] = fetchUser(id); // 永远增长！
  return cache[id];
}

// ❌ 泄漏 2：EventEmitter 未清理监听器
const emitter = new EventEmitter();
function setupListener() {
  emitter.on('data', handleData); // 每次调用都增加监听器！
}

// ❌ 泄漏 3：闭包持有大对象
function createHandler() {
  const HUGE_BUFFER = Buffer.alloc(50 * 1024 * 1024); // 50MB
  return function handler(req) {
    // HUGE_BUFFER 永远不会被 GC
    console.log(HUGE_BUFFER.length);
  };
}
```

### 2.2 诊断工具

```javascript
// 监控内存使用
setInterval(() => {
  const used = process.memoryUsage();
  console.log({
    heapUsed:  `${(used.heapUsed  / 1024 / 1024).toFixed(1)} MB`,
    heapTotal: `${(used.heapTotal / 1024 / 1024).toFixed(1)} MB`,
    rss:       `${(used.rss       / 1024 / 1024).toFixed(1)} MB`,
    external:  `${(used.external  / 1024 / 1024).toFixed(1)} MB`,
  });
}, 5000);

// Heap Snapshot（Chrome DevTools 分析）
const v8 = require('v8');
const snapshot = v8.writeHeapSnapshot(); // 写入 .heapsnapshot 文件
```

---

## 3. CPU 性能分析

```bash
# 方法 1: --prof 内置 profiler
node --prof app.js
# 运行一段时间后 Ctrl+C，生成 isolate-*.log
node --prof-process isolate-*.log > profile.txt

# 方法 2: clinic.js（推荐）
npm install -g clinic
clinic flame -- node app.js  # 火焰图
clinic bubbleprof -- node app.js  # 异步分析
clinic doctor -- node app.js  # 综合诊断
```

```javascript
// 方法 3: Performance API
const { performance, PerformanceObserver } = require('perf_hooks');

const observer = new PerformanceObserver((list) => {
  list.getEntries().forEach((entry) => {
    console.log(`${entry.name}: ${entry.duration.toFixed(2)}ms`);
  });
});
observer.observe({ entryTypes: ['measure'] });

performance.mark('start');
// ... 要测量的代码 ...
performance.mark('end');
performance.measure('my-operation', 'start', 'end');
```

---

## 4. 异步堆栈追踪

```bash
# Node.js 12+: --async-context
node --async-context app.js

# 更好的错误堆栈（附带源码映射）
npm install source-map-support
require('source-map-support').install();
```

---

## 5. 实践 Checklist

- [ ] 用 `--inspect-brk` 在 Chrome DevTools 中调试 Node.js 代码
- [ ] 运行 `demo-memory-leak.js`，用 Heap Snapshot 找到泄漏对象
- [ ] 用 `--prof` 生成 CPU profile，找出热点函数
- [ ] 用 `process.memoryUsage()` 监控内存增长趋势
