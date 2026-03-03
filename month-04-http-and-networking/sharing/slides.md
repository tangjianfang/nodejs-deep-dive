# HTTP 协议深度解析 — 从 TCP 到 HTTP/2 的演进

> 📅 月度技术分享 | Month 04 | Node.js Deep Dive  
> ⏱️ 预计时长：60 分钟  
> 👥 适合：有一定 Web 开发经验的工程师

---

## Slide 1 · 开场

### HTTP 版본 时间线

```
1991 ──── HTTP/0.9 ──────────── 只有 GET，只返回 HTML
1996 ──── HTTP/1.0 ──────────── 加入 Headers、状态码、其他方法
1997 ──── HTTP/1.1 ──────────── Keep-Alive、管道化、Host 头（25年主流！）
2015 ──── HTTP/2   ──────────── 二进制、多路复用、HPACK、Server Push
2022 ──── HTTP/3   ──────────── 基于 QUIC/UDP，解决 TCP 队头阻塞
```

### 开场问题 🙋

> **"你们系统用的是 HTTP/1.1 还是 HTTP/2？知道如何查吗？"**

```bash
# 查看网站使用的 HTTP 版本
curl -Isv https://example.com 2>&1 | grep "HTTP/"
# 或 Chrome DevTools → Network → Protocol 列
```

---

🗣️ **Speaker Notes:**  
欢迎大家！今天我们深入 HTTP 协议——这是每个 Web 开发者每天都在用、但很少有人真正理解内部机制的技术。  
我们会从 TCP 字节流开始，一路走到 HTTP/2 的多路复用，中间还会手写一个 WebSocket 服务器。  
请大家打开终端，今天会有几个 live demo。

---

## Slide 2 · HTTP/1.1 请求报文解剖

### 一次 HTTP 请求的完整字节

```
GET /api/users?page=1 HTTP/1.1\r\n     ← 请求行
Host: api.example.com\r\n               ← 必须有的头部
Accept: application/json\r\n
Connection: keep-alive\r\n
Authorization: Bearer eyJ...\r\n
\r\n                                    ← 空行！header/body 分隔符
                                        ← body（GET 没有）
```

### 关键细节

| 细节 | 为什么重要 |
|------|-----------|
| `\r\n` 换行 | 必须是 CRLF，不是 `\n`，不然解析失败 |
| `Host` 头部 | HTTP/1.1 **强制要求**（虚拟主机靠它区分）|
| 空行 | 标志 headers 结束，必不可少 |
| Header 大小写 | HTTP/1.1 不敏感，但 HTTP/2 要求**全小写** |

---

🗣️ **Speaker Notes:**  
让我们用 `telnet` 或原始 socket 发一个 HTTP 请求，看真实字节。  
`telnet httpbin.org 80`，然后手输：  
```
GET /get HTTP/1.1
Host: httpbin.org
Connection: close

```
（注意最后有一个空行！）  
这就是 HTTP 的本质——纯文本协议。

---

## Slide 3 · 状态码分类详解

### 5 大类别速记

```
1xx → 信息    "我收到了，继续..."
2xx → 成功    "搞定！"
3xx → 重定向  "去别处找"
4xx → 你的锅  "客户端出错了"
5xx → 我的锅  "服务端挂了"
```

### 高频易混淆状态码

| 对比 | 301 vs 302 | 401 vs 403 | 400 vs 422 |
|------|-----------|-----------|-----------|
| **区别** | 永久 vs 临时 | 未认证 vs 无权限 | 格式错 vs 语义错 |
| **缓存** | 会被缓存 | 不缓存 | - | - |
| **例子** | HTTP→HTTPS | 无 Token vs 无权限 | JSON 残缺 vs 业务校验失败 |
| **重点** | 301 改变 Method？ | 401 要求登录 | 422 更语义化 |

> ⚠️  很多 API 错误用 200 + error body，这是**反模式**！

---

🗣️ **Speaker Notes:**  
互动：我拿几个场景，大家说用哪个状态码：  
1. 用户 token 过期了？→ 401  
2. 管理员接口，普通用户访问？→ 403  
3. POST /users 但邮箱格式不对？→ 400 或 422  
4. DELETE /resource 成功，无内容返回？→ 204  
5. 创建成功，返回新资源？→ 201

---

## Slide 4 · Live Demo 1 — Mini HTTP Server

### 用 `net` 模块从零实现 HTTP 服务器

```bash
node month-04-http-and-networking/notes/scripts/demo-mini-http-server.js
```

### 核心代码片段

```javascript
// 本质：HTTP = TCP + 文本格式约定
const net = require('net');
net.createServer(socket => {
  socket.on('data', chunk => {
    const raw = chunk.toString();
    // 1. 解析请求行：GET /path HTTP/1.1
    // 2. 解析 Headers（: 分隔，\r\n 换行）
    // 3. 读取 Body（根据 Content-Length）
    // 4. 构建响应（HTTP/1.1 200 OK\r\n...）
    socket.write('HTTP/1.1 200 OK\r\nContent-Length: 13\r\n\r\nHello World!\n');
    socket.end();
  });
}).listen(7070);
```

### Node.js `http` 模块 = net + llhttp 解析器 + IncomingMessage/ServerResponse

---

🗣️ **Speaker Notes:**  
演示 demo-mini-http-server.js，用 curl 依次测试各路由。  
重点讲解：  
- `\r\n\r\n` 如何分割 header 和 body  
- `Content-Length` 如何知道何时读完 body  
- Node.js 的 IncomingMessage 其实就是把这些封装成了 Stream API  
提问：**"为什么 GET 请求也可以有 body？"**（答：规范允许，但服务端通常忽略）

---

## Slide 5 · HTTP/1.1 性能瓶颈

### 队头阻塞 (Head-of-Line Blocking)

```
HTTP/1.1 同一连接串行处理:
                     
请求1 ═════════════════▶ 响应1
                              请求2 ═══▶ 响应2   ← 必须等!
                                              请求3 ═▶ 响应3

浏览器解决方案: 每个域名开 6 个并行连接
  conn1: ──请求A──▶  ──请求D──▶
  conn2: ──请求B──────────────▶
  conn3: ──请求C────────▶
  ...（最多6个）
→ 问题：连接建立成本高，服务端并发压力大
```

### Keep-Alive vs Close

```javascript
// HTTP/1.0 默认 close（每次新建 TCP 连接）
// HTTP/1.1 默认 keep-alive（复用连接）
res.setHeader('Connection', 'keep-alive');
res.setHeader('Keep-Alive', 'timeout=5, max=100');
```

---

🗣️ **Speaker Notes:**  
让大家思考：为什么 HTTP/1.1 25年后才被 HTTP/2 取代？  
因为它"够用"——keep-alive + 并发连接 + CDN 覆盖了大多数场景。  
但随着页面资源增多（现代页面平均 100+ 资源），队头阻塞的代价越来越明显。

---

## Slide 6 · HTTP/2 核心特性总览

### 解决 HTTP/1.1 的三大痛点

```
痛点1: 队头阻塞
  HTTP/2解法: 多路复用 (Multiplexing)
  同一 TCP 连接上多个流交织传输，互不阻塞

痛点2: 头部冗余（每次发送完整 headers）
  HTTP/2解法: HPACK 压缩
  静态表 + 动态表，最高 99% 压缩率

痛点3: 客户端必须先请求才能收到资源
  HTTP/2解法: Server Push
  服务端预测并主动推送资源
```

### 帧结构对比

```
HTTP/1.1 (文本):        HTTP/2 (二进制帧):
GET /index HTTP/1.1     ┌────────┬──────┬───────┐
Host: example.com  →    │ Length │ Type │ Flags │
Accept: text/html       ├────────┴──────┴───────┤
                        │    Stream ID (31)      │
                        ├────────────────────────┤
                        │    Payload...          │
                        └────────────────────────┘
```

---

🗣️ **Speaker Notes:**  
HTTP/2 的二进制帧是关键变革——它让多路复用成为可能。  
在文本协议中，你无法区分"这段数据属于哪个请求的响应"，因为文本是线性的。  
二进制帧有 Stream ID，可以交织来自不同请求的帧，接收方按 Stream ID 重组。

---

## Slide 7 · Live Demo 2 — HTTP/2 Server Push

```bash
# 先生成自签名证书
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem \
  -days 365 -nodes -subj "/CN=localhost"

# 运行演示
node month-04-http-and-networking/notes/scripts/demo-http2.js

# 测试（-k 跳过证书验证）
curl -k --http2 -v https://localhost:8443/push-demo
```

### Server Push 工作流程

```
Client                          Server
  │── GET /index.html ──────────→│
  │←── PUSH_PROMISE /style.css ──│  (服务端主动告知)
  │←── PUSH_PROMISE /app.js ─────│
  │←── 200 OK (HTML body) ───────│
  │←── 200 OK (CSS body) ────────│  (并行！)
  │←── 200 OK (JS body) ─────────│
  
  以上全在 1 个 TCP 连接完成！
```

---

🗣️ **Speaker Notes:**  
打开 Chrome DevTools，访问 /push-demo，在 Network 面板中：  
1. 只有 1 个 TCP 连接（Protocol 列全是 h2）  
2. CSS 和 JS 的 Initiator 是 "Push" 而非 "Other"  
3. 它们的时间线显示几乎与 HTML 同时开始  
注意：Chrome 已移除 Server Push 支持（2022），用 103 Early Hints 替代。  
但 curl 和 Node.js 客户端仍然支持。

---

## Slide 8 · HPACK 压缩详解

### 两张表 + 哈夫曼编码

```
静态表（61 条，所有客户端共享）:
  Index 2 → :method: GET
  Index 4 → :path: /
  ...

动态表（每连接独立，按使用动态扩展）:
  首次请求: "authorization: Bearer xxx" → 加入动态表索引 62
  第二次请求: 只发送 [62] 这 1 个字节！

效果:
  第1次请求头部: ~800 bytes → 压缩后 ~300 bytes（-60%）
  第2次请求头部: ~800 bytes → 压缩后 ~30 bytes（-96%！）
```

### 实际抓包对比
```bash
# HTTP/1.1 头部（每次完整发送）
curl --http1.1 -v https://api.github.com/users/octocat 2>&1 | grep -E "^>"

# HTTP/2 头部（HPACK 压缩，无法直接看明文）
curl --http2 -v https://api.github.com/users/octocat 2>&1 | grep -E "^\[h2\]"
```

---

🗣️ **Speaker Notes:**  
互动：Header 压缩对谁影响最大？  
答案：API 服务器（每个请求都有 Authorization、Cookie 等重复头部）。  
举例：一个 gRPC 服务，每次调用 50+ 头部，HPACK 让头部开销从 ~1KB 降到 ~20bytes。  
这也是为什么 gRPC 必须运行在 HTTP/2 上。

---

## Slide 9 · TLS 握手深度解析

### TLS 1.3 握手（仅 1-RTT）

```
Client                          Server
  │                               │
  │── ClientHello ───────────────→│
  │   ├─ 支持版本: TLS 1.3         │
  │   ├─ 随机数                   │
  │   ├─ 密码套件列表              │
  │   ├─ ALPN: ["h2", "http/1.1"] │← 协议协商！
  │   └─ 密钥共享 (ECDHE)         │
  │                               │
  │←── ServerHello + ════════════ │← 开始加密
  │    Certificate +              │
  │    Finished ─────────────────│
  │                               │
  │── Finished ──────────────────→│
  │                               │
  │══════ 应用数据 ═══════════════│← 1-RTT 完成!
```

### ALPN：在 TLS 握手时确定 HTTP 版本
```
客户端 ClientHello:
  extensions.ALPN = ["h2", "http/1.1"]   ← 支持这两个

服务端 ServerHello:
  extensions.ALPN = "h2"                  ← 选了 HTTP/2！
```

---

🗣️ **Speaker Notes:**  
ALPN 是理解"为什么 HTTPS 和 HTTP/2 经常一起出现"的关键。  
HTTP/2 规范并不要求 TLS，但所有浏览器都只在 TLS 上实现 HTTP/2（叫 h2），  
cleartext 模式叫 h2c，只有服务间通信才用。  
Node.js 的 `socket.alpnProtocol` 就能看到协商结果。

---

## Slide 10 · WebSocket — 真正的全双工

### WebSocket vs 其他实时方案

```
长轮询:  Client ──GET──→ wait → ←data   ──GET──→ wait → ←data ...
SSE:     Client ──GET──→ ←event  ←event  ←event  ←event ...（单向）
WS:      Client ──Upgrade──→ ←→ ←→ ←→ ←→（双向，任意时刻）
```

### WebSocket 握手的魔法

```
1. 客户端发送 HTTP 请求（最后一次 HTTP！）:
   GET /ws HTTP/1.1
   Upgrade: websocket
   Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==

2. 服务端验证并响应:
   HTTP/1.1 101 Switching Protocols
   Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
   
3. 连接升级为 WS 协议，TCP 连接继续使用，
   但不再走 HTTP 格式，而是二进制帧格式

Key 验证:
   Accept = Base64(SHA1(Key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))
```

---

🗣️ **Speaker Notes:**  
这个魔法字符串 "258EAFA5-E914-47DA-95CA-C5AB0DC85B11" 是 RFC 6455 写死的 GUID，  
目的是确保服务端确实理解 WebSocket 协议（而不是把 WS 请求误当普通 HTTP 处理）。

---

## Slide 11 · Live Demo 3 — WebSocket 握手动画

```bash
node month-04-http-and-networking/notes/scripts/demo-websocket.js
```

```
# 终端 1: 启动 WS 服务器（无任何外部依赖！）
node demo-websocket.js

# 终端 2: 连接测试
wscat -c ws://localhost:8765

# 或者浏览器控制台:
const ws = new WebSocket('ws://localhost:8765');
ws.onmessage = e => console.log(JSON.parse(e.data));
ws.send('Hello WS!');
ws.send(JSON.stringify({type: 'broadcast', message: 'Hi everyone!'}));
```

### 帧格式（关键字段）

```
Byte 0: [FIN=1][RSV=000][opcode=0001]  ← 文本帧，最后一片
Byte 1: [MASK=1][payload_len=0000101]  ← 有掩码，长度=5
Byte 2-5: [masking key 4 bytes]
Byte 6+:  [XOR 解密后的 payload]
```

---

🗣️ **Speaker Notes:**  
重点演示：  
1. 看服务器日志中显示握手的 Key 和 Accept 计算过程  
2. 发送一条消息，看 Ping/Pong 心跳日志  
3. 发送广播消息，观察多个连接收到消息  
提问：**"为什么客户端→服务端的帧必须有掩码，而服务端→客户端不需要？"**  
答案：防止中间代理缓存污染攻击（浏览器中间代理可能把未掩码的 WS 数据误当 HTTP 缓存）

---

## Slide 12 · WebSocket 生产实践

### 连接状态机

```
CONNECTING → OPEN → CLOSING → CLOSED
                ↑                ↓
                └── 自动重连 ────┘
```

### 大规模架构：多节点广播

```
用户A ──WS──→ 节点1 ─┐
用户B ──WS──→ 节点2 ─┼──→ Redis Pub/Sub ←──→ 所有节点监听
用户C ──WS──→ 节点3 ─┘

消息流:
  用户A 发消息 → 节点1 → 发布到 Redis → 节点1/2/3 都收到 → 广播给各自的用户
```

### 安全三要素
1. **Origin 检查** — 防止非授权页面建立 WS（仅限浏览器）
2. **Token 认证** — 握手后第一条消息验证身份
3. **Rate Limiting** — 防止消息洪水攻击

---

🗣️ **Speaker Notes:**  
生产中 WebSocket 最难的不是实现，是**运维**：  
- 负载均衡：WS 是长连接，需要粘性会话（sticky session）或 Redis PubSub  
- 优雅重启：服务器重启时不能粗暴断开，要给客户端时间迁移  
- 监控：需要追踪活跃连接数、消息速率、内存占用  
推荐库：socket.io（封装了 WS + fallback + room + namespace），但理解底层很重要!

---

## Slide 13 · 总结与速查

### 三个协议的核心特点

| | HTTP/1.1 | HTTP/2 | WebSocket |
|--|----------|--------|-----------|
| 传输格式 | 文本 | 二进制帧 | 二进制帧 |
| 复用 | 6连接 | 1连接多流 | 1连接全双工 |
| 首包延迟 | TCP+HTTP | TCP+TLS+HTTP2 | TCP+TLS+WS握手 |
| 适用 | 通用 | REST/gRPC | 实时通信 |
| Node.js模块 | `http` | `http2` | `ws` or `net` |

### 今天的核心洞见

1. **HTTP 本质 = TCP + 文本格式约定**，用 `net` 模块可以完整实现
2. **HTTP/2 多路复用** 解决了队头阻塞，但 TCP 层的队头阻塞仍存在（→ HTTP/3 / QUIC）
3. **HPACK** 压缩对高频 API 调用影响显著（gRPC、微服务）
4. **WebSocket** 握手复用 HTTP，但协议完全不同，帧格式需要手动处理
5. **TLS ALPN** 是 HTTP/2 协议协商的关键，也是 HTTPS 性能的基础

---

🗣️ **Speaker Notes:**  
结束前的一个思考问题：  
**"如果你要优化一个高并发 API，你会首先考虑切换到 HTTP/2 吗？还是其他方式？"**  
答案取决于：  
- 如果是浏览器→服务器：HTTP/2 有显著帮助（头部压缩 + 多路复用）
- 如果是服务器→服务器：gRPC（基于 HTTP/2）比 REST HTTP/1.1 有明显优势
- 如果是实时推送：WebSocket 或 SSE

---

## Slide 14 · 下月预告 & 作业

### Month 05：框架的本质
- Express 中间件链如何实现？
- Koa 洋葱模型 vs Express 直线模型
- NestJS DI 容器内部机制

### 本月作业

```
Level 1 (必做):
  [ ] 运行 demo-mini-http-server.js，理解 HTTP 解析
  [ ] 用 curl 或 wscat 测试 WebSocket 服务器
  [ ] 阅读 http-internals.md 中的连接池部分

Level 2 (进阶):
  [ ] 生成自签名证书，运行 HTTP/2 demo
  [ ] 用 Wireshark 抓包分析 HTTP/1.1 vs HTTP/2 帧结构
  [ ] 为 demo-websocket.js 添加房间（room）功能

Level 3 (挑战):
  [ ] 实现 WebSocket 消息压缩（permessage-deflate 扩展）
  [ ] 用 http2 模块实现一个支持 Server Push 的静态文件服务器
  [ ] 调研 HTTP/3 (QUIC)：为什么用 UDP 代替 TCP？
```

---

🗣️ **Speaker Notes:**  
感谢大家！今天内容比较密，但这些都是理解 Node.js 网络编程的基础。  
Session 录像和 slides 会放在 GitHub。  
下次分享框架专题，我们会看到 Express 的实现只有几百行——比很多人想象的简单。  
有问题欢迎在 issue 或群里提！

---

*📌 参考资料*  
- [RFC 7230-7235](https://tools.ietf.org/html/rfc7230) — HTTP/1.1 规范  
- [RFC 7540](https://tools.ietf.org/html/rfc7540) — HTTP/2 规范  
- [RFC 6455](https://tools.ietf.org/html/rfc6455) — WebSocket 规范  
- [RFC 7541](https://tools.ietf.org/html/rfc7541) — HPACK 规范  
- [Node.js http2 文档](https://nodejs.org/api/http2.html)  
- [High Performance Browser Networking](https://hpbn.co/) — Ilya Grigorik 著（强烈推荐！）
