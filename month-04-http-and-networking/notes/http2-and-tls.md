# HTTP/2 与 TLS 深度解析 — 多路复用、HPACK 与 TLS 握手

## 1. HTTP/1.1 vs HTTP/2 全面对比

| 特性 | HTTP/1.1 | HTTP/2 |
|------|----------|--------|
| 发布年份 | 1997 (RFC 2616) | 2015 (RFC 7540) |
| 传输格式 | 文本 | **二进制帧** |
| 多路复用 | ❌（流水线有队头阻塞）| ✅（一个 TCP 连接多个流）|
| 头部压缩 | ❌（每次完整发送）| ✅ **HPACK** 压缩 |
| 服务器推送 | ❌ | ✅ Server Push |
| 优先级 | ❌ | ✅ 流优先级 |
| 连接数 | 浏览器每域名 6 个 | 1 个（多路复用）|
| TLS 要求 | 非必须 | 事实上必须（浏览器强制）|
| 头部大小写 | 大小写不敏感 | **全小写**（伪头部以 `:` 开头）|

---

## 2. HTTP/2 二进制分帧层

HTTP/1.1 是文本协议，HTTP/2 在 TCP 之上增加了**帧 (Frame)**层：

```
+-------+--------+----------+---------+
|  Length (24)   | Type (8) | Flags(8)|
+---------------+----------+---------+
|R|       Stream Identifier (31)      |
+---+-----------------------------------+
|              Frame Payload           |
+--------------------------------------+
```

### 帧类型
| Type | 名称 | 说明 |
|------|------|------|
| 0x0 | DATA | 传输请求/响应 body |
| 0x1 | HEADERS | 传输头部（压缩后）|
| 0x2 | PRIORITY | 设置流优先级 |
| 0x3 | RST_STREAM | 重置/取消一个流 |
| 0x4 | SETTINGS | 连接参数配置 |
| 0x5 | PUSH_PROMISE | 服务器推送预告 |
| 0x6 | PING | 心跳/往返时间 |
| 0x7 | GOAWAY | 关闭连接 |
| 0x8 | WINDOW_UPDATE | 流量控制 |
| 0x9 | CONTINUATION | 头部的续帧 |

---

## 3. HTTP/2 多路复用 (Multiplexing)

```
HTTP/1.1 - 6个并行连接，每个连接串行:
Conn1: [=====请求A=====][======请求D======]
Conn2: [===请求B===][=======请求E=======]
Conn3: [========请求C========][==请求F==]
... (最多6个)

HTTP/2 - 1个连接，多个流交织:
Conn:  [A1][B1][C1][A2][B2][A3][C2][B3][D1][C3]...
        ↑   ↑   ↑              ← 帧交织传输，无队头阻塞
      流A  流B  流C
```

### 流 (Stream) 的概念
- 每个 HTTP 请求/响应对对应一个**流 ID**（客户端发起为奇数，服务端推送为偶数）
- 流内部有序，流之间无序（可交织）
- 流可以独立设置优先级和依赖关系

```
Stream 1: GET /index.html
Stream 3: GET /style.css  (depends on stream 1, weight 32)
Stream 5: GET /app.js     (depends on stream 1, weight 16)
Stream 7: GET /logo.png   (no dependency, weight 1)
```

---

## 4. HPACK 头部压缩

HTTP/2 使用 **HPACK** (RFC 7541) 压缩头部，主要通过两张表：

### 静态表 (Static Table) — 61 条预定义对
| Index | Header Name | Value |
|-------|-------------|-------|
| 1 | `:authority` | |
| 2 | `:method` | GET |
| 3 | `:method` | POST |
| 4 | `:path` | / |
| 5 | `:path` | /index.html |
| ... | ... | ... |
| 61 | `www-authenticate` | |

### 动态表 (Dynamic Table)
每个连接维护一个动态表，将常用头部缓存起来：

```
第1次请求:
  发送: ":authority: api.example.com" → 添加到动态表 index 62
  发送: "authorization: Bearer token" → 添加到动态表 index 63

第2次请求:
  只发送索引: [62][63]  ← 极大减少数据量!
```

### 压缩对比示例
```
头部原始大小: ~800 bytes (包括 User-Agent, Cookie 等)
HPACK 压缩后: ~20-50 bytes (首次) / ~5 bytes (后续)
压缩率: 85-99%
```

---

## 5. HTTP/2 Server Push

服务端可以主动推送客户端**可能需要**的资源：

```
Client                    Server
  │──GET /index.html─────▶│
  │◀──PUSH_PROMISE /css───│  推送 CSS 预告
  │◀──PUSH_PROMISE /js────│  推送 JS 预告
  │◀──HEADERS + DATA /html│  正文响应
  │◀──HEADERS + DATA /css─│  CSS 数据
  │◀──HEADERS + DATA /js──│  JS 数据（并行！）
```

> ⚠️ Server Push 被滥用后 Chrome 已在 2022 年移除支持；建议优先使用 `<link rel="preload">` 或 `103 Early Hints`

---

## 6. TLS 握手详解

### TLS 1.3 握手（1-RTT）
```
Client                              Server
  │                                   │
  │──ClientHello──────────────────────▶│
  │  ├─ 支持的 TLS 版本列表              │
  │  ├─ 随机数 (client_random)          │
  │  ├─ 支持的密码套件 (cipher_suites)  │
  │  ├─ 支持的扩展 (SNI, ALPN, ...)     │
  │  └─ 密钥共享参数 (key_share)        │
  │                                   │
  │◀─ServerHello──────────────────────│
  │  ├─ 选择的 TLS 版本                │
  │  ├─ 随机数 (server_random)         │
  │  ├─ 选择的密码套件                 │
  │  └─ 密钥共享参数 (key_share)       │
  │                                   │
  │◀─EncryptedExtensions──────────────│ ← 加密传输开始
  │◀─Certificate─────────────────────│  服务器证书
  │◀─CertificateVerify───────────────│  证书签名
  │◀─Finished─────────────────────── │  握手 MAC
  │                                   │
  │──Finished─────────────────────────▶│
  │                                   │
  │══ 应用数据（加密）════════════════│ ← 1-RTT 完成
```

### TLS 1.2 握手（2-RTT，对比）
```
Client                              Server
  │──ClientHello─────────────────────▶│
  │◀─ServerHello + Certificate────────│
  │◀─ServerHelloDone──────────────────│
  │──ClientKeyExchange────────────────▶│
  │──ChangeCipherSpec─────────────────▶│
  │──Finished─────────────────────────▶│
  │◀─ChangeCipherSpec─────────────────│
  │◀─Finished─────────────────────────│
  │══ 应用数据 ═══════════════════════│ ← 2-RTT，比 TLS 1.3 多一次往返
```

### TLS 1.3 关键改进
| 特性 | TLS 1.2 | TLS 1.3 |
|------|---------|---------|
| 握手往返 | 2-RTT | 1-RTT（支持 0-RTT 会话恢复）|
| 前向保密 | 可选（ECDHE）| 强制（所有密钥交换）|
| 废弃的密码套件 | 支持 MD5/SHA1/RC4/3DES/RSA 密钥交换 | 全部废弃 |
| 加密 | 握手部分明文 | 握手后全部加密 |

---

## 7. 常见密码套件解读

```
TLS_AES_256_GCM_SHA384
│    │       │      └─ PRF (Pseudorandom Function) 哈希算法
│    │       └─ 认证加密算法 (AEAD: Authenticated Encryption with Associated Data)
│    └─ 密钥大小
└─ 协议
                        
TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 (TLS 1.2 格式)
     │      │        │       │     └─ PRF 哈希
     │      │        │       └─ 认证加密
     │      │        └─ 密钥大小
     │      └─ 认证算法（证书签名）
     └─ 密钥交换算法（提供前向保密）
```

---

## 8. ALPN 协议协商

**ALPN** (Application-Layer Protocol Negotiation) 是 TLS 扩展，在握手时协商上层协议：

```
ClientHello:
  extensions:
    - ALPN: ["h2", "http/1.1"]    ← 客户端声明支持 HTTP/2 和 HTTP/1.1

ServerHello:
  extensions:
    - ALPN: "h2"                   ← 服务器选择 HTTP/2
```

这样无需额外往返即可确定使用哪个协议。

---

## 9. Node.js HTTPS 服务器（自签证书）

### 生成自签名证书
```bash
# 生成私钥
openssl genrsa -out key.pem 2048

# 生成自签名证书（有效期 365 天）
openssl req -new -x509 -key key.pem -out cert.pem -days 365 \
  -subj "/C=CN/ST=Beijing/L=Beijing/O=Dev/CN=localhost"

# 或一步完成
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem \
  -days 365 -nodes -subj "/CN=localhost"
```

### Node.js HTTPS Server
```javascript
const https = require('https');
const fs = require('fs');

const options = {
  key: fs.readFileSync('key.pem'),
  cert: fs.readFileSync('cert.pem'),
  // 启用 TLS 1.3
  minVersion: 'TLSv1.2',
  // ALPN 协议（Node.js 会自动处理）
};

const server = https.createServer(options, (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Hello HTTPS!');
});

server.listen(443, () => console.log('HTTPS server on port 443'));
```

---

## 10. Node.js `http2` 模块

### HTTP/2 服务器
```javascript
const http2 = require('http2');
const fs = require('fs');

const server = http2.createSecureServer({
  key: fs.readFileSync('key.pem'),
  cert: fs.readFileSync('cert.pem'),
  allowHTTP1: true,  // 降级支持 HTTP/1.1
});

server.on('stream', (stream, headers) => {
  const path = headers[':path'];
  const method = headers[':method'];
  
  console.log(`${method} ${path}`);

  stream.respond({
    ':status': 200,
    'content-type': 'text/html; charset=utf-8',
  });
  
  stream.end('<h1>Hello HTTP/2!</h1>');
});

server.listen(8443);
```

### HTTP/2 Server Push
```javascript
server.on('stream', (stream, headers) => {
  if (headers[':path'] === '/') {
    // 推送 CSS（在发送 HTML 之前）
    stream.pushStream({ ':path': '/style.css' }, (err, pushStream) => {
      if (err) { pushStream.destroy(err); return; }
      pushStream.respond({
        ':status': 200,
        'content-type': 'text/css',
      });
      pushStream.end('body { color: red; }');
    });

    // 推送 JS
    stream.pushStream({ ':path': '/app.js' }, (err, pushStream) => {
      if (err) { pushStream.destroy(err); return; }
      pushStream.respond({
        ':status': 200,
        'content-type': 'application/javascript',
      });
      pushStream.end('console.log("pushed!")');
    });

    // 响应 HTML
    stream.respond({ ':status': 200, 'content-type': 'text/html' });
    stream.end(`
      <html>
        <head><link rel="stylesheet" href="/style.css"></head>
        <body><script src="/app.js"></script></body>
      </html>
    `);
  }
});
```

### HTTP/2 客户端
```javascript
const http2 = require('http2');

const client = http2.connect('https://localhost:8443', {
  rejectUnauthorized: false,  // 允许自签名证书（仅开发）
});

const req = client.request({ ':path': '/' });

req.on('response', (headers) => {
  console.log('Status:', headers[':status']);
});

req.setEncoding('utf8');
let data = '';
req.on('data', chunk => { data += chunk; });
req.on('end', () => {
  console.log(data);
  client.close();
});

req.end();
```

---

## 11. 证书链与信任模型

```
Root CA Certificate (自签名，预装在操作系统)
  └── Intermediate CA Certificate (由 Root CA 签发)
        └── Server Certificate (由 Intermediate CA 签发)
              └── 绑定到 example.com
```

### 证书验证过程
1. 服务器发送证书链
2. 客户端验证服务器证书被 Intermediate CA 签名 ✓
3. 验证 Intermediate CA 被 Root CA 签名 ✓
4. 验证 Root CA 在信任存储中 ✓
5. 验证证书未过期 ✓
6. 验证证书的 CN/SAN 匹配请求域名 ✓
7. 验证 OCSP/CRL 证书未被吊销 ✓（可选）

---

## 12. 练习 Checklist

- [ ] 用 `openssl s_client -connect example.com:443 -tls1_3` 查看 TLS 握手
- [ ] 实现一个 HTTP/2 server，演示 Server Push
- [ ] 用 Wireshark 抓包对比 HTTP/1.1 和 HTTP/2 的报文大小
- [ ] 分析 `openssl x509 -in cert.pem -text -noout` 输出的证书结构
- [ ] 配置 Node.js http2 client，并行发送 10 个请求，观察 stream ID
