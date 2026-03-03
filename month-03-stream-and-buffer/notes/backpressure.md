# 背压（Backpressure）与 highWaterMark

## 1. 什么是背压？

背压是流式数据处理中的**流量控制机制**：当下游消费速度 < 上游生产速度时，系统需要通知上游"慢下来"，否则中间缓冲区将无限增长，最终导致内存耗尽。

```
生产者（Producer）──push──▶ [内部缓冲区] ──read──▶ 消费者（Consumer）
                                ↑                          ↓
                                └──────── backpressure ────┘
                                    消费者满了，通知生产者暂停
```

---

## 2. highWaterMark（高水位线）

每个流都有一个 `highWaterMark`（HWM），表示内部缓冲区的"建议上限"：

| 流类型 | 默认 HWM | 单位 |
|--------|----------|------|
| Readable | 16 KiB | 字节 |
| Writable | 16 KiB | 字节 |
| objectMode | 16 | 对象个数 |

```js
// 创建时指定 HWM
const readable = fs.createReadStream('large.mp4', { highWaterMark: 64 * 1024 }); // 64KB
const writable = fs.createWriteStream('out.mp4', { highWaterMark: 16 * 1024 });  // 16KB
```

HWM **不是硬限制**：缓冲区可以超过 HWM，但超过后流会发出信号（`write()` 返回 `false`）。

---

## 3. Writable 的背压信号

```js
const writable = fs.createWriteStream('output.txt');

function writeLoop(i) {
  if (i >= 10000) {
    writable.end();
    return;
  }

  const canContinue = writable.write(`line ${i}\n`);

  if (canContinue) {
    // 缓冲区未满，立即继续
    setImmediate(() => writeLoop(i + 1));
  } else {
    // 缓冲区已满（write 返回 false），等待 drain 事件
    console.log(`背压触发于第 ${i} 行，等待 drain...`);
    writable.once('drain', () => {
      console.log('drain 触发，恢复写入');
      writeLoop(i + 1);
    });
  }
}

writeLoop(0);
```

**关键事件**：
- `drain`：Writable 缓冲区已清空，可以继续写入
- `write()` 返回值：`true` = 缓冲区 ≤ HWM，可继续；`false` = 应暂停上游

---

## 4. pipe 自动处理背压

`pipe()` 内部封装了完整的背压逻辑：

```js
// pipe 的伪实现（揭示原理）
function simplePipe(readable, writable) {
  readable.on('data', (chunk) => {
    const ok = writable.write(chunk);
    if (!ok) {
      readable.pause(); // ← 下游满了，暂停上游
    }
  });

  writable.on('drain', () => {
    readable.resume(); // ← 下游腾空，恢复上游
  });

  readable.on('end', () => writable.end());
}
```

这也是为什么**直接用 `on('data')` + `write()` 时必须手动处理背压**。

---

## 5. Transform Stream 的双向背压

Transform 既是 Readable 又是 Writable，两端都有缓冲区：

```
 readable ──write──▶ [writable buffer] ──_transform──▶ [readable buffer] ──read──▶ consumer
              ↑                                                                          ↓
              └─────────────────────────── backpressure ───────────────────────────────┘
```

如果 `_transform` 中产生的数据速度快于消费者读取，Readable 端缓冲区会触发背压，进而阻塞 `_transform` 调用。

---

## 6. 背压失控的后果

```js
// ❌ 危险：忽略背压，内存无限增长
const source = fs.createReadStream('10GB-file.csv');
const slow = new SlowTransformStream(); // 每个 chunk 处理需要 100ms

source.on('data', (chunk) => slow.write(chunk)); // 不等待背压！
// 结果：slow 的内部缓冲区积累 GB 级数据，Node.js OOM

// ✅ 使用 pipeline，自动背压管理
await pipeline(source, slow, destination);
```

---

## 7. 实践 Checklist

- [ ] 能解释 highWaterMark 的含义和默认值
- [ ] 会实现手动背压：检查 `write()` 返回值 + 监听 `drain`
- [ ] 理解 `pause()` / `resume()` 的含义
- [ ] 知道 `pipe()` 自动处理背压的原理
- [ ] 使用 `pipeline（stream/promises）` 避免内存泄漏
- [ ] 会用 `--inspect` + Chrome DevTools 观察流的缓冲区增长
