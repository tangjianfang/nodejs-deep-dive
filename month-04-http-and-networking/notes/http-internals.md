# HTTP/1.1 深度解析 — 请求响应、连接管理与 Node.js 内部实现

## 1. HTTP 协议概述

HTTP (HyperText Transfer Protocol) 是应用层协议，运行在 TCP 之上（HTTP/3 运行在 QUIC/UDP 之上）。

```
应用层:  HTTP / HTTPS
传输层:  TCP (port 80/443) / UDP (QUIC)
网络层:  IP
链路层:  Ethernet / Wi-Fi
```

---

## 2. HTTP/1.1 请求报文解剖

```
GET /api/users?page=1&limit=10 HTTP/1.1\r\n
Host: api.example.com\r\n
User-Agent: Mozilla/5.0 (Node.js)\r\n
Accept: application/json\r\n
Accept-Encoding: gzip, deflate, br\r\n
Connection: keep-alive\r\n
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...\r\n
\r\n
(body is empty for GET)
```

### 请求行 (Request Line)
```
METHOD SP Request-URI SP HTTP-Version CRLF
```

| 部分 | 示例 | 说明 |
|------|------|------|
| Method | `GET` | HTTP 动词 |
| Request-URI | `/api/users?page=1` | 路径 + 查询字符串 |
| HTTP-Version | `HTTP/1.1` | 协议版本 |
| CRLF | `\r\n` | 行结束符（必须是 CRLF） |

### 请求头 (Request Headers)
每行格式：`Header-Name: value\r\n`，以空行 `\r\n` 结束。

---

## 3. HTTP/1.1 响应报文解剖

```
HTTP/1.1 200 OK\r\n
Date: Mon, 03 Mar 2026 10:00:00 GMT\r\n
Server: nginx/1.24.0\r\n
Content-Type: application/json; charset=utf-8\r\n
Content-Length: 42\r\n
Connection: keep-alive\r\n
Cache-Control: max-age=60\r\n
ETag: "33a64df551425fcc55e"\r\n
\r\n
{"users":[{"id":1,"name":"Alice"}]}
```

### 状态行 (Status Line)
```
HTTP-Version SP Status-Code SP Reason-Phrase CRLF
```

---

## 4. HTTP 状态码含义

### 1xx — 信息性
| 状态码 | 含义 | 使用场景 |
|--------|------|---------|
| 100 Continue | 服务器已收到请求头，客户端可继续发送 body | 大文件上传前确认 |
| 101 Switching Protocols | 协议切换 | WebSocket Upgrade |
| 103 Early Hints | 预加载提示 | 提前推送资源链接 |

### 2xx — 成功
| 状态码 | 含义 | 使用场景 |
|--------|------|---------|
| 200 OK | 请求成功 | GET/PUT 成功返回 |
| 201 Created | 资源已创建 | POST 创建新资源 |
| 204 No Content | 成功但无响应体 | DELETE 成功 |
| 206 Partial Content | 部分内容 | 断点续传，Range 请求 |

### 3xx — 重定向
| 状态码 | 含义 | 使用场景 |
|--------|------|---------|
| 301 Moved Permanently | 永久重定向（缓存） | HTTP → HTTPS |
| 302 Found | 临时重定向 | 登录后跳转 |
| 304 Not Modified | 资源未修改 | 协商缓存命中 |
| 307 Temporary Redirect | 临时重定向（保留方法） | POST 不变为 GET |
| 308 Permanent Redirect | 永久重定向（保留方法） | 同上但永久 |

### 4xx — 客户端错误
| 状态码 | 含义 | 使用场景 |
|--------|------|---------|
| 400 Bad Request | 请求格式错误 | JSON 解析失败 |
| 401 Unauthorized | 未认证 | Token 缺失或过期 |
| 403 Forbidden | 禁止访问 | 权限不足 |
| 404 Not Found | 资源不存在 | 路由未匹配 |
| 405 Method Not Allowed | 方法不允许 | 对 GET 路由发 POST |
| 409 Conflict | 冲突 | 唯一键重复 |
| 422 Unprocessable Entity | 语义错误 | 业务校验失败 |
| 429 Too Many Requests | 请求过多 | 熔断/限流 |

### 5xx — 服务端错误
| 状态码 | 含义 | 使用场景 |
|--------|------|---------|
| 500 Internal Server Error | 服务器内部错误 | 未捕获异常 |
| 502 Bad Gateway | 网关错误 | 上游服务不可用 |
| 503 Service Unavailable | 服务不可用 | 服务器过载/维护 |
| 504 Gateway Timeout | 网关超时 | 上游响应超时 |

---

## 5. 重要请求头详解

### Connection 管理
```http
Connection: keep-alive   # HTTP/1.1 默认，保持 TCP 连接
Connection: close        # 响应后关闭连接
Connection: Upgrade      # 请求协议升级（WebSocket）
```

### Keep-Alive 参数
```http
Keep-Alive: timeout=5, max=1000
# timeout: 空闲连接保持秒数
# max: 连接上最大请求数
```

### Content-Encoding（压缩）
```http
# 请求方声明支持的压缩
Accept-Encoding: gzip, deflate, br, zstd

# 响应方声明实际压缩方式
Content-Encoding: gzip
Content-Encoding: br      # Brotli，比 gzip 压缩率更高
```

| 算法 | 压缩率 | 速度 | 使用场景 |
|------|--------|------|---------|
| gzip | 中 | 快 | 通用 |
| deflate | 低 | 最快 | 少用（实现不一致） |
| br (Brotli) | 高 | 慢 | HTTPS 下使用 |
| zstd | 高 | 很快 | 新兴，Firefox 支持 |

### Transfer-Encoding（传输编码）
```http
Transfer-Encoding: chunked
```

**Chunked 传输**：不知道 Content-Length 时使用，每个 chunk 前标注大小：
```
4\r\n        ← chunk 大小（16进制）
Wiki\r\n     ← chunk 数据
6\r\n
pedia \r\n
0\r\n        ← 结束标志
\r\n
```

> ⚠️ `Content-Length` 和 `Transfer-Encoding: chunked` 互斥

### Cache 相关
```http
# 请求
Cache-Control: no-cache          # 不使用缓存（需向服务器验证）
Cache-Control: no-store          # 不缓存任何内容
If-None-Match: "33a64df5514"     # 发送上次的 ETag
If-Modified-Since: Mon, 03 Mar 2026 00:00:00 GMT

# 响应
Cache-Control: max-age=3600, public
ETag: "33a64df551425fcc55e"
Last-Modified: Mon, 03 Mar 2026 09:00:00 GMT
Vary: Accept-Encoding            # 按压缩方式分别缓存
```

---

## 6. HTTP 方法详解

### 安全性与幂等性
| 方法 | 安全（只读）| 幂等（重复执行结果相同）| 有 Body | 使用场景 |
|------|------------|------------------------|---------|---------|
| GET | ✅ | ✅ | ❌（可有但忽略）| 读取资源 |
| HEAD | ✅ | ✅ | ❌ | 只获取响应头 |
| OPTIONS | ✅ | ✅ | 可选 | CORS 预检、获取允许方法 |
| POST | ❌ | ❌ | ✅ | 创建资源、提交数据 |
| PUT | ❌ | ✅ | ✅ | 全量替换资源 |
| PATCH | ❌ | ❌ | ✅ | 部分更新资源 |
| DELETE | ❌ | ✅ | 可选 | 删除资源 |

> **幂等性**：对同一资源执行 N 次与执行 1 次效果相同  
> **安全性**：不修改服务端状态（只读）

```
PUT /users/1 → 替换用户 1 的全部数据（幂等）
PATCH /users/1 → 更新用户 1 的部分字段（非幂等，如 increment 操作）
```

---

## 7. URL 解剖

```
https://user:pass@api.example.com:8080/v1/users/123?page=2&sort=asc#section1
│────┘  │────────┘ │─────────────┘ │──┘│──────────┘ │──────────────┘ │──────┘
scheme  userinfo   host            port path          query            fragment
```

| 部分 | 说明 | URL 编码 |
|------|------|---------|
| scheme | 协议 (http/https/ftp) | 不编码 |
| userinfo | `user:password@`（不推荐在 URL 中放密码）| 需编码 |
| host | 域名或 IP | 不编码 |
| port | 端口（http 默认 80，https 默认 443）| 不编码 |
| path | 资源路径，`/` 分隔 | 字母数字 `-._~` 不编码 |
| query | `key=value` 对，`&` 分隔 | `+` 或 `%20` 表示空格 |
| fragment | 锚点，**不发送到服务器** | 不发送 |

```javascript
const url = new URL('https://api.example.com/users?q=hello world');
console.log(url.pathname);  // '/users'
console.log(url.search);    // '?q=hello%20world'
console.log(url.searchParams.get('q')); // 'hello world'（自动解码）
```

---

## 8. HTTP 连接管理

### HTTP/1.0 vs HTTP/1.1 连接对比

```
HTTP/1.0 (每次请求都建立新连接):
Client              Server
  │──SYN─────────────▶│
  │◀────────SYN-ACK───│
  │──ACK─────────────▶│  TCP握手 3次
  │──GET /────────────▶│
  │◀────────200 OK────│
  │──FIN─────────────▶│  TCP关闭 4次
  │◀────────ACK───────│
  │◀────────FIN───────│
  │──ACK─────────────▶│

HTTP/1.1 Keep-Alive (复用连接):
Client              Server
  │──TCP Handshake───▶│
  │──GET /────────────▶│
  │◀────────200 OK────│
  │──GET /about───────▶│  复用!
  │◀────────200 OK────│
  │──GET /api─────────▶│  复用!
  │◀────────200 OK────│
  │──Connection: close▶│
  │──TCP Close────────▶│
```

### HTTP/1.1 流水线（Pipelining）
```
Client              Server
  │──GET /a──▶│
  │──GET /b──▶│  不等响应直接发（流水线）
  │──GET /c──▶│
  │◀──200 /a──│  必须按顺序响应
  │◀──200 /b──│  队头阻塞 (Head-of-Line Blocking)!
  │◀──200 /c──│
```

> ⚠️ 流水线有"**队头阻塞**"问题，实际浏览器普遍禁用（HTTP/2 解决了这个问题）

---

## 9. Node.js `http` 模块内部实现

### 请求处理流程
```
TCP Socket 接收数据
    ↓
HTTPParser (C++ binding, llhttp)
    ↓ 解析请求行和headers
IncomingMessage (req)    ← 继承 Readable stream
    ↓
OutgoingMessage (res)    ← 继承 Writable stream
    ↓
'request' 事件触发 → 用户 handler
```

### 核心类层次
```
EventEmitter
  └── Stream
        ├── Readable
        │     └── IncomingMessage (req)
        └── Writable
              └── OutgoingMessage
                    ├── ServerResponse (res)
                    └── ClientRequest
```

### 基本使用
```javascript
const http = require('http');

const server = http.createServer((req, res) => {
  // req: IncomingMessage (Readable stream)
  // res: ServerResponse (Writable stream)
  
  console.log(req.method);     // 'GET'
  console.log(req.url);        // '/api/users?page=1'
  console.log(req.headers);    // { 'content-type': 'application/json', ... }
  
  // 读取 body（stream）
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    console.log('body:', body);
    
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true }));
  });
});

server.listen(3000, () => console.log('Listening on :3000'));
```

### 解析 URL 和查询字符串
```javascript
const { URL } = require('url');

const req_url = '/api/users?page=2&sort=name';
const base = 'http://localhost';
const parsed = new URL(req_url, base);

parsed.pathname;                    // '/api/users'
parsed.searchParams.get('page');    // '2'
parsed.searchParams.get('sort');    // 'name'
```

---

## 10. `http.Agent` 连接池

`http.Agent` 负责管理 HTTP 连接（TCP socket）的复用。

### 内部机制
```
http.Agent
  ├── freeSockets: { 'api.example.com:80:': [Socket, Socket] }  ← 空闲连接池
  ├── sockets: { 'api.example.com:80:': [Socket] }              ← 活跃连接
  └── requests: { 'api.example.com:80:': [Request] }            ← 等待队列
```

### 关键配置
```javascript
const http = require('http');

const agent = new http.Agent({
  keepAlive: true,        // 启用 Keep-Alive（默认 false）
  keepAliveMsecs: 1000,   // Keep-Alive 心跳间隔
  maxSockets: 10,         // 每个 host 最大并发连接数（默认 Infinity）
  maxFreeSockets: 5,      // 最大空闲连接数（默认 256）
  timeout: 5000,          // socket 超时
});

// 使用自定义 agent
const req = http.request({
  hostname: 'api.example.com',
  path: '/users',
  agent: agent  // 使用连接池
}, (res) => { /* ... */ });
```

### 连接池工作流程
```
请求1 → 创建新 Socket → 完成 → 放入 freeSockets
请求2 → 发现 freeSockets 有空闲 Socket → 复用! → ...
...
同时10个请求 → maxSockets=10 全被占用 → 请求11进入 requests 队列 → 等待
```

### 禁用连接复用
```javascript
// 方式1: 每次请求使用新连接
http.request({ ..., agent: false });

// 方式2: 使用全局默认 agent（默认不 keepAlive）
http.globalAgent  // maxSockets: Infinity, keepAlive: false
```

---

## 11. 实战：手动发送 HTTP 请求（了解底层）

```javascript
const net = require('net');

const socket = net.createConnection({ host: 'httpbin.org', port: 80 }, () => {
  // 手动构造 HTTP/1.1 请求
  const request = [
    'GET /get HTTP/1.1',
    'Host: httpbin.org',
    'Connection: close',
    '',  // 空行表示 headers 结束
    ''
  ].join('\r\n');
  
  socket.write(request);
});

let response = '';
socket.on('data', chunk => response += chunk.toString());
socket.on('end', () => {
  const [header, ...bodyParts] = response.split('\r\n\r\n');
  console.log('=== Headers ===');
  console.log(header);
  console.log('=== Body ===');
  console.log(bodyParts.join('\r\n\r\n'));
});
```

---

## 12. 练习 Checklist

- [ ] 用 Wireshark 或 `tcpdump` 抓取一次 HTTP 请求，手动解读报文
- [ ] 用 `net` 模块实现一个能处理 GET/POST 的最小 HTTP 服务器
- [ ] 配置 `http.Agent` 的 `keepAlive: true`，对比请求延迟
- [ ] 实现一个支持 Chunked 传输的流式响应
- [ ] 理解 304 Not Modified 的完整缓存协商流程
- [ ] 分析 `Transfer-Encoding: chunked` 的格式，手动解码
