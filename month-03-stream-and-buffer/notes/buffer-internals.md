# Buffer 底层原理

## 1. Buffer 是什么？

`Buffer` 是 Node.js 对 V8 堆外内存（off-heap memory）的封装，底层使用 `Uint8Array`，操作的是**原始二进制字节**。

```js
// Buffer 与 TypedArray 的关系
const buf = Buffer.alloc(4);           // <Buffer 00 00 00 00>
const view = new Uint8Array(buf.buffer); // 共享底层 ArrayBuffer

buf[0] = 0xff;
console.log(view[0]); // 255 — 同一块内存
```

---

## 2. 内存分配策略

| 方式 | 方法 | 说明 |
|------|------|------|
| 预分配池（Pool） | `Buffer.allocUnsafe(size)` | 从 8KB 内存池切片，**不清零**，速度快但不安全 |
| 零初始化 | `Buffer.alloc(size)` | 每次独立分配，**清零**，安全 |
| 外部引用 | `Buffer.from(arrayBuffer)` | 引用已有 ArrayBuffer，不复制 |
| 字符串转换 | `Buffer.from(str, encoding)` | 编码默认 UTF-8 |

```js
// allocUnsafe 可能包含旧内存数据！
const unsafe = Buffer.allocUnsafe(10);
console.log(unsafe); // <Buffer xx xx xx ...> 未知值

// 安全写法
const safe = Buffer.alloc(10); // 全为 00
```

**内存池原理**：Node.js 预先分配一块 8KB 的 ArrayBuffer，小 Buffer（< `Buffer.poolSize / 2 = 4KB`）直接从这块内存切片，减少 GC 压力。

---

## 3. 编码与解码

```js
// UTF-8 编码
const buf = Buffer.from('你好', 'utf8');
console.log(buf);          // <Buffer e4 bd a0 e5 a5 bd>（6 字节，每个汉字 3 字节）
console.log(buf.length);   // 6

// 转回字符串
console.log(buf.toString('utf8'));  // '你好'
console.log(buf.toString('hex'));   // 'e4bda0e5a5bd'
console.log(buf.toString('base64')); // '5L2g5aW9'

// 常用编码
// 'utf8'    — 默认，兼容 ASCII
// 'ascii'   — 7-bit，丢弃高位
// 'base64'  — 适合二进制数据在文本协议中传输
// 'hex'     — 十六进制字符串
// 'ucs2'    — UTF-16 LE，用于 Windows API 互操作
```

---

## 4. Buffer 操作

```js
// 拼接（正确写法）
const chunks = [];
readableStream.on('data', (chunk) => chunks.push(chunk));
readableStream.on('end', () => {
  const full = Buffer.concat(chunks); // ✅ 高效拼接
});

// ❌ 错误写法：字符串 += chunk 会破坏多字节字符
let str = '';
readableStream.on('data', (chunk) => str += chunk); // 可能截断 UTF-8！

// 正确的字符串拼接
readableStream.setEncoding('utf8');
let str = '';
readableStream.on('data', (chunk) => str += chunk); // 设置了 encoding 才安全
```

---

## 5. StreamDecoder 与多字节字符

```js
const { StringDecoder } = require('string_decoder');
const decoder = new StringDecoder('utf8');

// 分块传输中文时（UTF-8 每个字符 1-4 字节）可能被截断
const buf1 = Buffer.from([0xe4, 0xbd]);      // '你' 的前 2 字节
const buf2 = Buffer.from([0xa0, 0xe5, 0xa5, 0xbd]); // '你' 最后 1 字节 + '好'

// 直接 toString 会乱码
console.log(buf1.toString('utf8')); // '??'

// 用 StringDecoder 缓冲不完整字符
console.log(decoder.write(buf1)); // ''（等待完整字符）
console.log(decoder.write(buf2)); // '你好'（输出完整）
```

---

## 6. 零拷贝（Zero-Copy）

```js
// slice 不复制内存，返回"视图"
const buf = Buffer.from([1, 2, 3, 4, 5]);
const slice = buf.slice(1, 3); // <Buffer 02 03>
slice[0] = 99;
console.log(buf[1]); // 99 — 修改 slice 会影响原 buf！

// 安全复制
const copy = Buffer.from(buf.slice(1, 3)); // 独立内存
copy[0] = 0;
console.log(buf[1]); // 99 — 不受影响
```

**sendfile 系统调用**：Node.js 的 `fs.createReadStream` + `response.pipe()` 在 Linux 上会触发 `sendfile()` 系统调用，文件数据**不经过用户态内存**，直接从 page cache 传输到 socket buffer。

---

## 7. 实践 Checklist

- [ ] 了解 `Buffer.alloc` vs `Buffer.allocUnsafe` 的安全性差异
- [ ] 知道为什么 `Buffer.concat` 比 `+= chunk` 高效
- [ ] 会使用 `StringDecoder` 处理流式多字节字符
- [ ] 理解 `slice` 的零拷贝特性，注意共享内存的副作用
- [ ] 在性能敏感场景选择 `allocUnsafe` + 手动清零
