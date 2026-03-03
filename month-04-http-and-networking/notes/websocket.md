# WebSocket 深度解析 — 握手、帧协议与实时通信

## 1. 为什么需要 WebSocket？

| 技术 | 方向 | 协议 | 连接 | 延迟 | 适用场景 |
|------|------|------|------|------|---------|
| HTTP 轮询 | 客户端→服务端 | HTTP | 每次新建 | 高（轮询间隔）| 古老系统降级 |
| HTTP 长轮询 | 双向（模拟）| HTTP | 保持到有数据 | 中 | 低频更新，简单实现 |
| SSE (EventSource) | 服务端→客户端 | HTTP | 持久 | 低 | 单向推送（股票行情、日志）|
| WebSocket | **全双工** | WS/WSS | 持久 | **最低** | 聊天、游戏、协同编辑 |

```
HTTP 长轮询:                    WebSocket:
Client    Server               Client    Server
  │──GET──▶│                     │──Upgrade──▶│
  │ (等待) │                     │◀─101 OK────│
  │◀──data─│                     │◀──────data─│  随时推
  │──GET──▶│ ← 重新请求          │──────data─▶│  随时发
  │ (等待) │                     │◀──────data─│
  ...
```

---

## 2. WebSocket 握手 — HTTP Upgrade

WebSocket 通过一个特殊的 HTTP 请求**升级 (Upgrade)** 协议：

### 客户端请求
```http
GET /chat HTTP/1.1
Host: server.example.com
Upgrade: websocket                    ← 请求升级为 WebSocket
Connection: Upgrade                   ← 连接切换
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==  ← Base64(16字节随机数)
Sec-WebSocket-Version: 13             ← WebSocket 版本（必须是13）
Sec-WebSocket-Protocol: chat, superchat  ← 子协议（可选）
Sec-WebSocket-Extensions: permessage-deflate  ← 扩展（可选）
Origin: http://www.example.com
```

### 服务端响应
```http
HTTP/1.1 101 Switching Protocols      ← 101 升级成功
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=  ← 验证 key
Sec-WebSocket-Protocol: chat         ← 选择的子协议
```

### `Sec-WebSocket-Accept` 计算规则
```
Sec-WebSocket-Accept = Base64(SHA1(Sec-WebSocket-Key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))
```

```javascript
const crypto = require('crypto');

function computeAccept(wsKey) {
  const MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
  return crypto
    .createHash('sha1')
    .update(wsKey + MAGIC)
    .digest('base64');
}

// 示例:
// wsKey = 'dGhlIHNhbXBsZSBub25jZQ=='
// → SHA1('dGhlIHNhbXBsZSBub25jZQ==258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
// → Base64 → 's3pPLMBiTxaQ9kYGzzhZRbK+xOo='
```

---

## 3. WebSocket 帧结构 (Frame)

握手成功后，通信切换为 **WebSocket 帧协议**，完全脱离 HTTP：

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-------+-+-------------+-------------------------------+
|F|R|R|R| opcode|M| Payload len |    Extended payload length    |
|I|S|S|S|  (4)  |A|     (7)     |             (16/64)           |
|N|V|V|V|       |S|             |   (if payload len==126/127)   |
| |1|2|3|       |K|             |                               |
+-+-+-+-+-------+-+-------------+ - - - - - - - - - - - - - - -+
|  Extended payload length continued, if payload len == 127    |
+ - - - - - - - - - - - - - - -+-------------------------------+
|                               |  Masking-key, if MASK set to 1|
+-------------------------------+-------------------------------+
|    Masking-key (continued)    |          Payload Data         |
+-------------------------------- - - - - - - - - - - - - - - -+
:                     Payload Data continued ...               :
+---------------------------------------------------------------+
```

### 字段详解
| 字段 | 位数 | 说明 |
|------|------|------|
| FIN | 1 | 是否是消息的最后一帧（消息分片时使用）|
| RSV1/2/3 | 各1 | 保留位（扩展使用，如 permessage-deflate 用 RSV1）|
| opcode | 4 | 帧类型（见下表）|
| MASK | 1 | 是否使用掩码（**客户端→服务端必须为1**）|
| Payload len | 7 | 负载长度（0-125: 直接值，126: 后2字节，127: 后8字节）|
| Masking-key | 32 | 掩码密钥（MASK=1 时存在）|
| Payload | 变长 | 实际数据（掩码处理后）|

### Opcode 类型
| Opcode | 类型 | 说明 |
|--------|------|------|
| 0x0 | Continuation | 消息分片的续帧 |
| 0x1 | Text | UTF-8 文本数据 |
| 0x2 | Binary | 二进制数据 |
| 0x8 | Close | 关闭连接 |
| 0x9 | Ping | 心跳检测 |
| 0xA | Pong | 心跳响应 |

### 客户端掩码处理
```
// 客户端发送必须掩码（防止缓存污染攻击）
maskedByte[i] = originalByte[i] XOR maskingKey[i % 4]

// 服务端解码
originalByte[i] = maskedByte[i] XOR maskingKey[i % 4]
```

---

## 4. Ping/Pong 心跳机制

```
Client              Server
  │                   │
  │──Ping (0x9)───────▶│  ← 约每30s发送
  │◀─Pong (0xA)────────│  ← 服务端必须立即响应
  │                   │
  │ (如果超时无Pong)   │
  │──TCP Close────────▶│  ← 关闭连接
```

```javascript
// 服务端定时 ping（ws 库）
setInterval(() => {
  wss.clients.forEach(client => {
    if (client.isAlive === false) {
      return client.terminate(); // 上次 ping 没有收到 pong，断开
    }
    client.isAlive = false;
    client.ping();
  });
}, 30000);

ws.on('pong', () => {
  ws.isAlive = true; // 收到 pong，标记存活
});
```

---

## 5. WebSocket 连接状态机

```
                  ┌─────────────────────────────┐
                  │                             │
              CONNECTING (0)                    │
         HTTP Upgrade 进行中                   │
                  │                             │
         握手成功 │                             │
                  ▼                             │
               OPEN (1) ◄──────────┐           │
          可以发送和接收            │           │
                  │                │           │
     close() / 对端关闭           │           │
                  │                │           │
                  ▼                │           │ 握手失败
            CLOSING (2)           错误重试    │
          关闭握手进行中           │           │
                  │                            │
                  ▼                            │
             CLOSED (3) ◄──────────────────────┘
           连接已关闭
```

```javascript
const ws = new WebSocket('wss://example.com');

console.log(ws.readyState); // 0 CONNECTING
ws.onopen = () => console.log(ws.readyState);  // 1 OPEN
ws.onclose = () => console.log(ws.readyState); // 3 CLOSED
```

---

## 6. 浏览器 WebSocket API

```javascript
// 建立连接
const ws = new WebSocket('wss://chat.example.com/ws', ['chat', 'json']);
//                                                      └─ 子协议列表

// 连接事件
ws.onopen = (event) => {
  console.log('Connected!');
  ws.send(JSON.stringify({ type: 'join', room: 'general' }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data);
};

ws.onerror = (event) => {
  console.error('WebSocket error:', event);
};

ws.onclose = (event) => {
  console.log(`Closed: code=${event.code} reason=${event.reason}`);
  // 自动重连
  setTimeout(() => reconnect(), 3000);
};

// 发送数据
ws.send('Hello, text!');              // 文本
ws.send(new Uint8Array([1, 2, 3]));   // 二进制

// 主动关闭
ws.close(1000, 'Normal closure');     // code 1000 = 正常关闭

// 检查连接状态
if (ws.readyState === WebSocket.OPEN) {
  ws.send('data');
}

// 发送队列大小（用于背压检测）
console.log(ws.bufferedAmount);
```

### 关闭码
| Code | 含义 |
|------|------|
| 1000 | 正常关闭 |
| 1001 | 端点离开（页面导航）|
| 1002 | 协议错误 |
| 1003 | 数据类型不支持 |
| 1006 | 连接异常关闭（没有收到 Close 帧）|
| 1007 | 数据格式不一致（如文本帧中含无效 UTF-8）|
| 1008 | 消息违反策略 |
| 1009 | 消息过大 |
| 1011 | 服务器遇到意外错误 |
| 4000-4999 | 自定义代码 |

---

## 7. Node.js `ws` 库

```javascript
// npm install ws
const WebSocket = require('ws');

// === 服务端 ===
const wss = new WebSocket.Server({
  port: 8080,
  // 自定义验证
  verifyClient: (info, cb) => {
    const origin = info.origin;
    const allowed = ['http://localhost:3000', 'https://myapp.com'];
    cb(allowed.includes(origin));
  }
});

wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`Client connected: ${clientIp}`);
  
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (data, isBinary) => {
    // 广播给所有客户端
    wss.clients.forEach(client => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(data, { binary: isBinary });
      }
    });
  });

  ws.on('close', (code, reason) => {
    console.log(`Disconnected: ${code} ${reason}`);
  });

  ws.on('error', (err) => {
    console.error('WS error:', err.message);
  });
  
  ws.send(JSON.stringify({ type: 'welcome', message: 'Connected!' }));
});

// 心跳检测
const heartbeat = setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => clearInterval(heartbeat));

// === 客户端 ===
const client = new WebSocket('ws://localhost:8080');

client.on('open', () => client.send('Hello Server!'));
client.on('message', data => console.log('Received:', data.toString()));
```

---

## 8. WebSocket 与 NestJS 集成

```typescript
// npm install @nestjs/websockets @nestjs/platform-ws ws

import { WebSocketGateway, WebSocketServer, SubscribeMessage, 
         OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, WebSocket } from 'ws';

@WebSocketGateway(8080, { 
  path: '/ws',
  cors: { origin: 'http://localhost:4200' }
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  handleConnection(client: WebSocket) {
    console.log('Client connected');
  }
  
  handleDisconnect(client: WebSocket) {
    console.log('Client disconnected');
  }

  @SubscribeMessage('message')
  handleMessage(client: WebSocket, payload: string): void {
    // 广播
    this.server.clients.forEach(c => {
      if (c.readyState === WebSocket.OPEN) c.send(payload);
    });
  }
}
```

---

## 9. WebSocket vs SSE vs Long Polling 详细对比

| 维度 | WebSocket | SSE (EventSource) | 长轮询 |
|------|-----------|-------------------|--------|
| 通信方向 | 全双工 | 单向（服务端→客户端）| 模拟双向 |
| 协议 | WS/WSS | HTTP | HTTP |
| 浏览器支持 | IE10+ | IE❌, 其他✅ | 全部 |
| 自动重连 | ❌（需自实现）| ✅（内置）| ❌ |
| 事件类型 | 无（需自定义）| ✅（内置 event 字段）| ❌ |
| 负载均衡 | 难（需粘性会话/Redis PubSub）| 容易 | 容易 |
| 服务器内存 | 每连接持久 | 每连接持久 | 请求期间 |
| 适用场景 | 聊天、游戏、协同 | 通知、日志流、SSE AI | 兼容性降级 |

---

## 10. WebSocket 安全

### Origin 检查（防止 CSRF）
```javascript
// 握手时验证 Origin（仅浏览器客户端有此限制）
const wss = new WebSocket.Server({
  port: 8080,
  verifyClient: ({ origin }) => {
    const allowed = new Set(['https://myapp.com', 'http://localhost:3000']);
    if (!allowed.has(origin)) {
      console.warn('Rejected origin:', origin);
      return false;  // 拒绝连接
    }
    return true;
  }
});
```

> ⚠️ 非浏览器客户端（curl、Node.js ws）可以伪造 Origin，因此还需要认证！

### 认证方式
```javascript
// 方式1: URL 参数（不推荐，会记录在日志）
// ws://example.com/ws?token=xxx

// 方式2: 握手时的 Cookie（推荐，与 HTTP 会话集成）
// 浏览器自动发送 Cookie（需 same-site 配置）

// 方式3: 连接后第一条消息发 token（推荐）
ws.on('connection', (socket) => {
  let authenticated = false;
  const timeout = setTimeout(() => socket.close(1008, 'Auth timeout'), 5000);
  
  socket.once('message', (data) => {
    const { token } = JSON.parse(data);
    if (verifyToken(token)) {
      authenticated = true;
      clearTimeout(timeout);
      socket.send(JSON.stringify({ type: 'auth_ok' }));
    } else {
      socket.close(4001, 'Invalid token');
    }
  });
});
```

### Rate Limiting
```javascript
const rateLimits = new Map();

ws.on('message', (data) => {
  const count = (rateLimits.get(clientId) || 0) + 1;
  rateLimits.set(clientId, count);
  
  if (count > 100) {  // 每分钟最多100条消息
    ws.close(4029, 'Rate limit exceeded');
    return;
  }
  
  // 每分钟重置
  setTimeout(() => rateLimits.delete(clientId), 60000);
});
```

---

## 11. 大规模 WebSocket 架构

```
客户端集群
  │     │     │
  ▼     ▼     ▼
[WS服务器1][WS服务器2][WS服务器3]
     │          │          │
     └──────────┼──────────┘
                ▼
         Redis Pub/Sub
         （消息广播总线）
```

```javascript
// 使用 Redis 实现多节点广播
const redis = require('ioredis');
const sub = new redis();
const pub = new redis();

// 订阅频道
sub.subscribe('chat');
sub.on('message', (channel, message) => {
  // 广播给本节点所有客户端
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
});

// 发布消息
ws.on('message', (data) => {
  pub.publish('chat', data);  // 发布到 Redis，所有节点收到
});
```

---

## 12. 练习 Checklist

- [ ] 用 `net` 模块从零实现 WebSocket 握手和帧编解码
- [ ] 实现一个带心跳检测的聊天室服务器
- [ ] 用 Chrome DevTools 的 Network 面板查看 WebSocket 帧
- [ ] 实现 WebSocket 重连机制（指数退避）
- [ ] 对比大量并发连接下 WebSocket 与 HTTP 长轮询的内存占用
- [ ] 理解 `permessage-deflate` 扩展如何压缩帧负载
