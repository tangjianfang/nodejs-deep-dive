# 🎤 Node.js 核心基础与底层原理

> 分享人：XXX | 日期：2025-02-XX | 时长：45min
> 🗣️ **演讲者备注**：本文档包含讲解节奏提示和互动引导

---

## 开场（1min）

### 先问一个问题

> **你写的 Node.js 代码为什么能跑起来？**

🗣️ **停顿 3 秒，让大家思考**

可能有人会说"因为有 V8"，也有人说"因为 Event Loop"。
今天我们就来揭秘这三个问题：

1. **V8 怎么让代码"越跑越快"？**
2. **Event Loop 怎么决定"谁先执行"？**
3. **`require()` 背后到底发生了什么？**

---

## Part 1：V8 引擎（15min）

---

### 🤔 开场问题

> **为什么同样的代码，第一次慢，跑一会儿就变快了？**

🗣️ **引导：有人遇到过预热（warm-up）的概念吗？**

---

### 先看一个现象

```js
function sum(n) {
  let x = 0;
  for (let i = 0; i < n; i++) x += i;
  return x;
}

console.time('cold');
sum(20_000_000); // 第一次
console.timeEnd('cold');

// 跑几轮预热
for (let i = 0; i < 3; i++) sum(20_000_000);

console.time('warm');
sum(20_000_000); // 再跑一次
console.timeEnd('warm'); // 通常更快
```

🗣️ **现场演示**：打开终端运行 `node demo-jit-warmup.js`
**引导观众看什么**："注意 cold 和 warm 的时间差异"

---

### 揭秘：V8 的策略

现在揭晓答案：

> **V8 不是一上来就把代码优化到极致，
> 而是"先跑起来，边跑边观察，发现热点再优化"。**

🗣️ **用类比帮助理解**：

你可以把 V8 想象成一个新同事：
- 第一天先按通用流程干活（保证正确）
- 发现你总做重复任务 → 做模板和捷径（优化）
- 某天你突然换做法 → 模板失效，回到通用流程（deopt）

---

### V8 执行流程（逐步展示）

```text
JS 源码
  ↓
字节码
```

🗣️ **先只展示这两行，问**："字节码之后呢？直接变机器码吗？"

**停顿 → 然后展开完整流程：**

```text
JS 源码
  ↓
字节码 → 解释执行（先保证能跑）
  ↓
收集反馈（类型、对象形状、调用目标）
  ↓
发现热点 → 优化编译 → 快路径
  ↓
假设失效 → 去优化 → 回退慢路径
```

---

### 三个核心武器

🗣️ **"V8 有三个让代码变快的核心技术，我用生活例子讲"**

| 技术 | 一句话 | 生活类比 |
|------|--------|----------|
| **JIT** | 高频代码才优化 | 通勤走久了才固定最快路线 |
| **Hidden Class** | 对象形状一致更好找属性 | 仓库纸箱标签位置统一就拿得快 |
| **Inline Cache** | 访问点记住常见模式走捷径 | 前台帮你按电梯，楼层固定就秒按 |

🗣️ **停顿确认**："这三个类比有没有帮助理解？"

---

### 🧪 实验：对象形状的影响

**先问**："你们觉得下面两个函数，哪个更快？"

```js
// 函数 A
function makeA() {
  return { x: 1, y: 2, z: 3 };
}

// 函数 B
function makeB() {
  const o = {};
  o.z = 3;  // 注意：顺序变了
  o.x = 1;
  o.y = 2;
  return o;
}
```

🗣️ **投票互动**："觉得 A 快举手 / 觉得 B 快举手 / 觉得一样快举手"

---

### 🎬 现场揭晓

```bash
node demo-hidden-class.js
```

🗣️ **边运行边解说**：
- "看第一行，makeA 用了多少时间"
- "看第二行，makeB 慢了多少"
- "虽然最终对象一样，但因为**添加属性的顺序不同**，V8 认为它们是不同形状"

**核心结论**：
> **对象形状越一致，Hidden Class 越统一，访问越快。**

---

### V8 部分总结

🗣️ **"记住一句话就够了"**：

> **代码越稳定（类型稳定、形状稳定、调用目标稳定），V8 越快。**

**三个实操建议**：
1. 同类对象保持相同属性顺序
2. 热路径函数参数类型尽量固定
3. 避免频繁 `delete` 或动态挂字段

🗣️ **过渡到下一部分**："V8 解决了'单次执行快'，但 Node.js 还要处理 I/O。这就要靠 Event Loop 了。"

---

## Part 2：Event Loop

---

### 什么是 Event Loop？

> **一个不断循环的调度器**，决定下一个执行哪个回调。

Node.js 单线程执行 JS，但 I/O 交给系统/线程池。
Event Loop 负责：I/O 完成后，把回调排进队列并按顺序执行。

---

### 六个阶段

```text
┌─> 1. timers          │ setTimeout / setInterval
│   2. pending callbacks│ 系统级回调
│   3. idle/prepare     │ 内部使用
│   4. poll             │ I/O 回调（停留最久的阶段）
│   5. check            │ setImmediate
│   6. close callbacks  │ socket.on('close')
└───────────────────────┘
```

---

### 微任务在哪？

微任务**不属于六阶段**，在**每个阶段切换之间**执行：

```text
当前阶段回调执行完
  → process.nextTick（全部清空）
  → Promise.then（全部清空）
  → 进入下一阶段
```

**nextTick 优先级 > Promise**

---

### 🧪 现场挑战

```js
console.log('1');
setTimeout(() => console.log('2'), 0);
setImmediate(() => console.log('3'));
process.nextTick(() => console.log('4'));
Promise.resolve().then(() => console.log('5'));
console.log('6');
```

答案：`1 → 6 → 4 → 5 → 2 → 3`（主模块中 2/3 顺序不确定）

---

### 🧪 I/O 回调内部

```js
const fs = require('fs');
fs.readFile(__filename, () => {
  setTimeout(() => console.log('timeout'), 0);
  setImmediate(() => console.log('immediate'));
});
```

答案：**一定是 `immediate → timeout`**

因为 I/O 回调在 poll 阶段，下一阶段是 check（setImmediate）。

---

### Event Loop 总结

> **不要阻塞 Event Loop，不要饿死 I/O。**

- `setImmediate` vs `setTimeout(0)`：I/O 回调中用 `setImmediate`
- `nextTick`：谨慎使用，递归会饿死 I/O
- 密集计算：拆小块或用 Worker Threads

---

## Part 3：模块系统

---

### require() 做了什么？

```text
require('xxx')
  → 路径解析（内置 > 相对路径 > node_modules）
  → 检查缓存（有 → 直接返回）
  → 读取文件
  → 包裹成函数：
    (function(exports, require, module, __filename, __dirname) {
      // 你的代码
    })
  → 执行函数
  → 缓存 & 返回 module.exports
```

这就是为什么每个文件都能用 `require`、`__dirname` 等变量。

---

### exports vs module.exports

```js
// ✅ 给 exports 添加属性
exports.add = (a, b) => a + b;

// ✅ 直接替换 module.exports
module.exports = { add: (a, b) => a + b };

// ❌ 给 exports 重新赋值（断开引用，不会导出）
exports = { add: (a, b) => a + b };
```

> `require()` 返回的永远是 `module.exports`

---

### 缓存 & 循环依赖

```js
const a = require('./mod'); // 第一次：执行代码
const b = require('./mod'); // 第二次：返回缓存
console.log(a === b);       // true
```

循环依赖时：返回"已导出的部分"（不报错但可能不完整）。

---

### CJS vs ESM 核心区别

| | CommonJS | ES Modules |
|------|----------|------------|
| 加载时机 | 运行时 | 编译时（静态） |
| 导出值 | 值的拷贝 | 活绑定 |
| Tree Shaking | 难 | 天然支持 |

> 新项目优先 ESM，老项目 CJS 不必强改。

---

## 总结

| 主题 | 一句话 |
|------|--------|
| V8 | 稳定的代码 → 持续优化 → 更快 |
| Event Loop | 不阻塞、不饿死 I/O |
| 模块系统 | require = 包裹 + 执行 + 缓存 |

---

## Q&A

> 💡 推荐阅读：`notes/` 目录下的详细笔记
> 🔬 Demo 脚本：`notes/scripts/` 目录
