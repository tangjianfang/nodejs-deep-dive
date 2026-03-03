# 4 种 Stream 类型解析

## 1. Stream 概览

Node.js 提供 4 种流抽象，所有流都继承自 `EventEmitter`。

| 类型 | 基类 | 方向 | 典型场景 |
|------|------|------|----------|
| Readable | `stream.Readable` | 只读 | `fs.createReadStream`、`http.IncomingMessage` |
| Writable | `stream.Writable` | 只写 | `fs.createWriteStream`、`http.ServerResponse` |
| Duplex | `stream.Duplex` | 双向（读+写独立） | `net.Socket`、TCP 连接 |
| Transform | `stream.Transform` | 双向（写入→转换→读出） | `zlib.createGzip`、加密流、CSV 解析 |

---

## 2. Readable Stream

### 两种消费模式

```js
const readable = fs.createReadStream('large-file.csv');

// ① flowing 模式（自动推送数据）
readable.on('data', (chunk) => process(chunk));

// ② paused 模式（手动拉取）
readable.on('readable', () => {
  let chunk;
  while ((chunk = readable.read(64)) !== null) {
    process(chunk);
  }
});
```

### 自定义 Readable

```js
const { Readable } = require('stream');

class NumberStream extends Readable {
  constructor(options) {
    super(options);
    this.n = 0;
  }

  // 当消费者需要数据时，Node.js 调用 _read
  _read(size) {
    if (this.n < 100) {
      this.push(String(this.n++)); // 推送数据
    } else {
      this.push(null); // null 表示流结束（EOF）
    }
  }
}

const ns = new NumberStream();
ns.pipe(process.stdout);
```

---

## 3. Writable Stream

```js
const { Writable } = require('stream');

class LogStream extends Writable {
  _write(chunk, encoding, callback) {
    // chunk: Buffer  encoding: 编码字符串  callback: 完成后调用（可传 err）
    console.log(`[LOG] ${chunk.toString()}`);
    callback(); // ✅ 必须调用，告知流可以继续写入
  }

  _final(callback) {
    // 在所有 _write 完成后，stream.end() 触发
    console.log('[LOG] stream ended');
    callback();
  }
}

const log = new LogStream();
log.write('hello\n');
log.write('world\n');
log.end(); // 触发 _final
```

---

## 4. Duplex Stream

Duplex 流的读端和写端**独立运作**，互不影响。常见于网络套接字。

```js
const { Duplex } = require('stream');

class EchoSocket extends Duplex {
  _read(size) { /* 读端：等待外部 push */ }

  _write(chunk, encoding, callback) {
    // 收到写入的数据，push 回读端（实现 echo）
    this.push(chunk);
    callback();
  }
}

const echo = new EchoSocket();
echo.write(Buffer.from('ping'));
echo.on('data', (d) => console.log(d.toString())); // 'ping'
```

---

## 5. Transform Stream（最常用！）

Transform 是 Duplex 的特殊形式：写入的数据经过 `_transform` 处理后推入读端。

```js
const { Transform } = require('stream');

class UpperCaseTransform extends Transform {
  _transform(chunk, encoding, callback) {
    // 转换数据：直接写入输出
    this.push(chunk.toString().toUpperCase());
    callback();
  }

  _flush(callback) {
    // 流结束时，输出最后的数据（如缓冲区剩余内容）
    this.push('\n--- EOF ---\n');
    callback();
  }
}

// 使用
const upper = new UpperCaseTransform();
process.stdin.pipe(upper).pipe(process.stdout);
// 输入 'hello' → 输出 'HELLO'
```

---

## 6. pipe 与 pipeline

```js
// 传统 pipe（注意：不自动处理错误！）
readable.pipe(transform).pipe(writable);
// 如果中间任何一步出错，其他流不会自动关闭，会造成内存泄漏

// ✅ pipeline（Node.js v10+）：自动错误传播 + 清理
const { pipeline } = require('stream/promises');

await pipeline(
  fs.createReadStream('input.csv'),   // 读
  new CsvTransform(),                  // 转换
  new ValidateTransform(),             // 验证
  fs.createWriteStream('output.json') // 写
);
// 任何一步报错，所有流都自动销毁
```

---

## 7. 对象模式（objectMode）

默认流传输 `Buffer` 或 `string`，开启 `objectMode` 可传输任意 JS 对象。

```js
const { Transform } = require('stream');

class ParseJsonLine extends Transform {
  constructor() {
    super({ objectMode: true }); // 上下游都是对象模式
  }

  _transform(line, encoding, callback) {
    try {
      this.push(JSON.parse(line.toString()));
    } catch (e) {
      this.emit('error', e);
    }
    callback();
  }
}
```

---

## 8. 实践 Checklist

- [ ] 理解 flowing 与 paused 模式的切换条件
- [ ] 自定义 Readable：正确使用 `push(null)` 结束流
- [ ] 自定义 Writable：`_write` 的 `callback` 必须调用
- [ ] 掌握 Transform：`_transform` + `_flush` 的配合
- [ ] 使用 `pipeline` 而不是 `pipe` 处理错误
- [ ] 了解 `objectMode` 的适用场景
