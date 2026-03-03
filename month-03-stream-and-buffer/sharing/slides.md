````markdown
# 🎤 Stream 才是 Node.js 的灵魂 — 从 Buffer 到背压的完整体系

> 分享人：XXX | 日期：2025-04-XX | 时长：45min

---

## 开场（2min）

### 一道面试题

> 用 Node.js 处理一个 **10GB 的 CSV 文件**，程序应该消耗多少内存？

A：至少 10GB  
B：取决于 JVM 堆大小  
C：**几十 MB 左右**（答案）  
D：会直接 OOM

🗣️ **揭秘**：Node.js Stream 的核心价值在于"永远只持有一小块数据"。  
今天我们来彻底搞懂这背后的机制。

---

## Part 1：Buffer — 内存中的"原始字节集装箱"（8min）

---

### Buffer vs String

```js
const str = '你好世界';
const buf = Buffer.from(str, 'utf8');

console.log(str.length); // 4（字符数）
console.log(buf.length); // 12（字节数，每个汉字 3 字节）
```

**关键区别**：
- `String`：JS 的逻辑字符，UTF-16 编码，在 V8 堆内
- `Buffer`：原始字节，C++ 层 ArrayBuffer，**堆外内存**

---

### 分配策略选择

| 场景 | 推荐 | 原因 |
|------|------|------|
| 存储用户数据后传输 | `Buffer.alloc(n)` | 清零，防止信息泄露 |
| 内部高性能处理 | `Buffer.allocUnsafe(n)` | 不清零，快 |
| 接收外部数据 | `Buffer.from(data)` | 引用或复制 |

🗣️ **现场提问**：`Buffer.allocUnsafe` 真的不安全吗？演示读到旧内存数据的场景。

---

## Part 2：4 种流类型速览（10min）

---

### 类比理解

```
Readable  = 水龙头（只出水）
Writable  = 水桶  （只接水）
Duplex    = 双向管（两端独立）
Transform = 净水器（输入脏水，输出净水）
```

---

### Transform 是最常用的

```js
class GbkToUtf8Transform extends Transform {
  _transform(chunk, encoding, callback) {
    // chunk: GBK Buffer → 推出: UTF-8 Buffer
    this.push(gbkDecoder.decode(chunk));
    callback();
  }
}

await pipeline(
  fs.createReadStream('gbk-file.txt'),
  new GbkToUtf8Transform(),
  fs.createWriteStream('utf8-file.txt'),
);
```

🗣️ **演示 demo-csv-transform.js**：Buffer → 逐行 → 解析 → 类型推断 → JSON

---

## Part 3：背压 — 流控的核心机制（12min）

---

### 背压 = 交通信号灯

```
生产者（高速公路）──▶ [缓冲区] ──▶ 消费者（小路）
                        ↑                ↓
                        └── 红灯（drain）─┘
```

没有背压 = 没有信号灯 → 逐渐堵车 → 内存 OOM

---

### write() 返回值的含义

```js
const ok = writable.write(chunk);
// ok = true  → 缓冲区 < highWaterMark，继续推
// ok = false → 缓冲区满了，等 drain
```

🗣️ **演示 demo-backpressure.js**：
- 场景 1：忽略背压，缓冲区积压
- 场景 2：正确处理，缓冲区受控
- 场景 3：pipe 自动管理

---

### pipe 内部的魔法

```js
// pipe 的伪代码（背压核心）
readable.on('data', (chunk) => {
  const ok = writable.write(chunk);
  if (!ok) readable.pause();    // ← 红灯
});
writable.on('drain', () => {
  readable.resume();              // ← 绿灯
});
```

**✅ 结论**：能用 `pipeline` 就用 `pipeline`，不要手写 `pipe`。

---

## Part 4：pipeline API 最佳实践（8min）

---

### 错误处理对比

```js
// ❌ 旧的 pipe：一个流出错，其他流不会自动关闭
readable.pipe(transform).pipe(writable);

// ✅ pipeline：任何一步出错，全链路自动清理
const { pipeline } = require('stream/promises');
try {
  await pipeline(readable, transform, writable);
} catch (err) {
  console.error('Pipeline failed:', err);
  // 所有流已自动销毁
}
```

---

### 中途取消（AbortController）

```js
const controller = new AbortController();

// 5 秒后取消上传
setTimeout(() => controller.abort(), 5000);

try {
  await pipeline(
    fileStream,
    encryptTransform,
    uploadStream,
    { signal: controller.signal }
  );
} catch (e) {
  if (e.code === 'ABORT_ERR') {
    console.log('上传已取消，资源自动释放');
  }
}
```

🗣️ **演示 demo-pipeline.js Demo 4**

---

## 总结（5min）

### 核心心智模型

```
Buffer    → 字节的容器，区分 alloc / allocUnsafe / from
Readable  → 生产者，控制 push / null
Writable  → 消费者，callback 驱动流量
Transform → 管道的中间层，_transform + _flush
pipeline  → 将所有流串联，自动错误传播 + 资源清理
背压      → write() false + drain = 节流阀
```

### 行动建议

1. 下次处理大文件时，首先考虑 Stream
2. 用 `pipeline` 替代 `pipe`
3. 开启 `--inspect`，观察流处理时的内存曲线（应保持平稳）

---

## 附录：Stream 常见坑

| 坑 | 原因 | 修复 |
|----|------|------|
| `pipe` 后内存泄漏 | 中途出错，流没销毁 | 改用 `pipeline` |
| 字符串拼接时乱码 | 多字节字符被截断 | 使用 `StringDecoder` 或 `setEncoding` |
| Transform 卡死 | `_transform` 忘记调 `callback` | 检查回调是否一定被调用 |
| objectMode 混搭 | 忘记设 `readableObjectMode` | Duplex/Transform 需分别设置 |
````
