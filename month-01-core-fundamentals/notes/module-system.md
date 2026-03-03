# 📦 Node.js 模块系统底层机制

> 目标：搞清楚——**`require()` 到底做了什么？CommonJS 和 ESM 有什么本质区别？**

---

## 目录

1. 模块系统解决什么问题
2. CommonJS（CJS）核心机制
3. require() 执行流程
4. 模块缓存与循环依赖
5. ES Modules（ESM）核心机制
6. CJS vs ESM 对比
7. 工程启示
8. Checklist（自检清单）

---

## 1. 模块系统解决什么问题

没有模块系统时，所有代码共享全局作用域 → 命名冲突、依赖不明确、无法按需加载。

模块系统的核心目标：
- **作用域隔离**：每个文件有独立作用域
- **依赖声明**：明确表达"我需要什么"
- **接口导出**：明确表达"我提供什么"

---

## 2. CommonJS（CJS）核心机制

### 2.1 一个模块 = 一个被包裹的函数

当你写一个文件 `math.js`：

```js
const PI = 3.14;
module.exports = { PI };
```

Node.js 实际执行的是：

```js
(function(exports, require, module, __filename, __dirname) {
  const PI = 3.14;
  module.exports = { PI };
});
```

这就是为什么：
- 每个文件里可以直接使用 `require`、`module`、`exports`、`__filename`、`__dirname`
- 变量不会泄露到全局——因为它们在函数作用域里

### 2.2 exports vs module.exports

```js
// exports 是 module.exports 的引用
// 相当于：var exports = module.exports;

// ✅ 正确：给 exports 添加属性
exports.add = (a, b) => a + b;

// ✅ 正确：直接替换 module.exports
module.exports = { add: (a, b) => a + b };

// ❌ 错误：给 exports 重新赋值（断开了引用）
exports = { add: (a, b) => a + b }; // 这不会导出任何东西！
```

记忆要点：`require()` 返回的永远是 `module.exports`，不是 `exports`。

---

## 3. require() 执行流程

```text
require('xxx')
  ↓
1. 路径解析（resolve）
   - 内置模块？→ 直接返回（如 'fs', 'path'）
   - 相对/绝对路径？→ 拼接为完整路径
   - 第三方包？→ 逐级向上查找 node_modules
  ↓
2. 检查缓存
   - require.cache[完整路径] 存在？→ 直接返回 module.exports
  ↓
3. 加载文件
   - .js  → 读取源码，包裹成函数并执行
   - .json → JSON.parse 后返回对象
   - .node → dlopen 加载 C++ 插件
  ↓
4. 编译执行
   - 创建 Module 对象
   - 包裹源码为函数 (function(exports, require, module, ...) { ... })
   - 执行该函数
  ↓
5. 缓存并返回 module.exports
```

### 路径解析优先级

```text
require('fs')           → 内置模块（最高优先级）
require('./math')       → 相对路径
require('/abs/math')    → 绝对路径
require('lodash')       → node_modules 逐级查找
```

文件扩展名补全顺序：`.js` → `.json` → `.node`

如果是目录：先找 `package.json` 的 `main` 字段，再找 `index.js`。

---

## 4. 模块缓存与循环依赖

### 4.1 缓存

```js
// 第一次 require 会执行模块代码
const a = require('./heavy-module');

// 第二次直接返回缓存，不重复执行
const b = require('./heavy-module');

console.log(a === b); // true
```

缓存基于**完整解析路径**。同一文件只执行一次。

### 4.2 循环依赖

```js
// a.js
console.log('a 开始');
exports.done = false;
const b = require('./b'); // 此时去执行 b.js
console.log('在 a 中，b.done =', b.done);
exports.done = true;
console.log('a 结束');

// b.js
console.log('b 开始');
exports.done = false;
const a = require('./a'); // a.js 还没执行完，拿到的是"部分导出"
console.log('在 b 中，a.done =', a.done); // false（不是 true！）
exports.done = true;
console.log('b 结束');
```

输出：
```text
a 开始
b 开始
在 b 中，a.done = false    ← 拿到的是未完成的导出
b 结束
在 a 中，b.done = true
a 结束
```

**核心机制**：遇到循环依赖时，Node.js 返回"当前已导出的部分"，不会报错也不会死循环。但拿到的可能是不完整的对象。

---

## 5. ES Modules（ESM）核心机制

Node.js 从 v12 开始支持 ESM（`import`/`export`），v16+ 稳定。

### 5.1 基本语法

```js
// math.mjs
export const PI = 3.14;
export function add(a, b) { return a + b; }
export default function multiply(a, b) { return a * b; }

// app.mjs
import multiply, { PI, add } from './math.mjs';
```

### 5.2 启用方式

1. 文件扩展名 `.mjs`
2. 或 `package.json` 中设置 `"type": "module"`

### 5.3 ESM 的三阶段加载

```text
1. 解析（Parse）：静态分析 import/export，构建模块依赖图
2. 实例化（Instantiate）：分配内存，建立导出/导入的绑定关系
3. 求值（Evaluate）：执行模块代码
```

关键区别：ESM 的 `import` 是**静态声明**（编译时确定），不是运行时函数调用。

---

## 6. CJS vs ESM 对比

| 特性 | CommonJS | ES Modules |
|------|----------|------------|
| 语法 | `require()` / `module.exports` | `import` / `export` |
| 加载时机 | 运行时（动态） | 编译时（静态分析） |
| 导出值 | 值的拷贝 | 值的活绑定（live binding） |
| 顶层 await | 不支持 | 支持 |
| this | `module.exports` | `undefined` |
| 循环依赖 | 返回部分导出对象 | 引用绑定（可能 TDZ 错误） |
| Tree Shaking | 难以实现 | 天然支持 |

### 值拷贝 vs 活绑定

```js
// === CJS：值拷贝 ===
// counter.js
let count = 0;
module.exports = { count, increment: () => ++count };

// app.js
const mod = require('./counter');
console.log(mod.count);    // 0
mod.increment();
console.log(mod.count);    // 还是 0！（拷贝不会变）

// === ESM：活绑定 ===
// counter.mjs
export let count = 0;
export function increment() { count++; }

// app.mjs
import { count, increment } from './counter.mjs';
console.log(count);        // 0
increment();
console.log(count);        // 1（绑定是活的）
```

---

## 7. 工程启示

- **新项目优先 ESM**：生态趋势、支持 Tree Shaking、语义更清晰
- **已有 CJS 项目不必强改**：Node.js 长期支持 CJS
- **避免循环依赖**：无论 CJS 还是 ESM 都会造成难以调试的问题
- **理解缓存**：`require` 只执行一次，想重新加载需手动清 `require.cache`
- **CJS 中用 ESM 模块**：用 `await import(...)` 动态导入

---

## 8. Checklist（自检清单）

- [ ] 知道 Node.js 如何将模块包裹成函数？
- [ ] 能区分 `exports` 和 `module.exports`？
- [ ] 能描述 `require()` 的完整解析流程？
- [ ] 知道模块缓存机制和 `require.cache`？
- [ ] 能解释循环依赖时发生了什么？
- [ ] 知道 CJS 和 ESM 在导出值上的核心区别（拷贝 vs 绑定）？
- [ ] 知道如何在项目中启用 ESM？

---
