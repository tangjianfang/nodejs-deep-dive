/**
 * demo-websocket.js
 * 从零实现 WebSocket 服务器（使用 net 模块，不依赖任何外部库）
 * 包含: 握手升级、帧编解码、Ping/Pong、Echo 服务器
 *
 * 运行: node demo-websocket.js
 * 测试: 用浏览器打开 ws://localhost:8765 或用 wscat
 *   npm install -g wscat
 *   wscat -c ws://localhost:8765
 *
 * 或者在浏览器控制台:
 *   const ws = new WebSocket('ws://localhost:8765');
 *   ws.onmessage = e => console.log(e.data);
 *   ws.send('Hello!');
 */

const net = require('net');
const crypto = require('crypto');

// ─── 常量 ──────────────────────────────────────────────────────────────────────

const WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

// WebSocket Opcode
const OPCODE = {
  CONTINUATION: 0x0,
  TEXT: 0x1,
  BINARY: 0x2,
  CLOSE: 0x8,
  PING: 0x9,
  PONG: 0xA,
};

const OPCODE_NAMES = Object.fromEntries(Object.entries(OPCODE).map(([k, v]) => [v, k]));

// ─── WebSocket 握手 ────────────────────────────────────────────────────────────

/**
 * 计算 Sec-WebSocket-Accept 值
 * RFC 6455: Base64(SHA1(key + MAGIC))
 */
function computeAcceptKey(wsKey) {
  return crypto
    .createHash('sha1')
    .update(wsKey + WS_MAGIC)
    .digest('base64');
}

/**
 * 解析 HTTP 握手请求，提取 WebSocket 升级信息
 */
function parseHandshake(data) {
  const str = data.toString('utf8');
  if (!str.includes('\r\n\r\n')) return null;

  const [headerSection] = str.split('\r\n\r\n');
  const lines = headerSection.split('\r\n');
  const [requestLine] = lines;
  
  const headers = {};
  for (const line of lines.slice(1)) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    headers[line.slice(0, colonIdx).trim().toLowerCase()] = line.slice(colonIdx + 1).trim();
  }
  
  const isWsUpgrade = 
    headers['upgrade']?.toLowerCase() === 'websocket' &&
    headers['connection']?.toLowerCase().includes('upgrade') &&
    headers['sec-websocket-key'] &&
    headers['sec-websocket-version'] === '13';
  
  if (!isWsUpgrade) return null;
  
  return {
    requestLine,
    headers,
    wsKey: headers['sec-websocket-key'],
    protocols: headers['sec-websocket-protocol']?.split(',').map(s => s.trim()) || [],
  };
}

/**
 * 构建 101 Switching Protocols 响应
 */
function buildUpgradeResponse(wsKey, protocol = null) {
  const accept = computeAcceptKey(wsKey);
  let response = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
  ];
  
  if (protocol) {
    response.push(`Sec-WebSocket-Protocol: ${protocol}`);
  }
  
  return Buffer.from(response.join('\r\n') + '\r\n\r\n');
}

// ─── 帧编码器 ──────────────────────────────────────────────────────────────────

/**
 * 编码 WebSocket 帧（服务端→客户端，不需要掩码）
 * @param {number} opcode 
 * @param {Buffer|string} payload 
 * @param {boolean} fin 是否最后一帧
 */
function encodeFrame(opcode, payload, fin = true) {
  const payloadBuf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8');
  const payloadLen = payloadBuf.length;

  let headerLen;
  if (payloadLen < 126) {
    headerLen = 2;
  } else if (payloadLen < 65536) {
    headerLen = 4;  // 2 + 2字节扩展长度
  } else {
    headerLen = 10; // 2 + 8字节扩展长度
  }

  const frame = Buffer.allocUnsafe(headerLen + payloadLen);

  // Byte 0: FIN(1) + RSV1-3(000) + opcode(4)
  frame[0] = (fin ? 0x80 : 0x00) | (opcode & 0x0F);

  // Byte 1+: MASK(0, 服务端不掩码) + payload length
  if (payloadLen < 126) {
    frame[1] = payloadLen; // MASK bit = 0
  } else if (payloadLen < 65536) {
    frame[1] = 126;
    frame.writeUInt16BE(payloadLen, 2);
  } else {
    frame[1] = 127;
    // 写 8 字节（high 4 bytes 设为 0，因为 JS Number 精度限制）
    frame.writeUInt32BE(0, 2);
    frame.writeUInt32BE(payloadLen, 6);
  }

  payloadBuf.copy(frame, headerLen);
  return frame;
}

// ─── 帧解码器 ──────────────────────────────────────────────────────────────────

/**
 * 解码 WebSocket 帧（客户端→服务端，有掩码）
 * 返回 null 表示数据不完整
 */
function decodeFrame(buffer) {
  if (buffer.length < 2) return null;

  const byte0 = buffer[0];
  const byte1 = buffer[1];

  const fin = !!(byte0 & 0x80);
  const rsv1 = !!(byte0 & 0x40);
  const rsv2 = !!(byte0 & 0x20);
  const rsv3 = !!(byte0 & 0x10);
  const opcode = byte0 & 0x0F;
  const masked = !!(byte1 & 0x80);
  let payloadLen = byte1 & 0x7F;

  let offset = 2;

  // 扩展长度
  if (payloadLen === 126) {
    if (buffer.length < 4) return null;
    payloadLen = buffer.readUInt16BE(2);
    offset = 4;
  } else if (payloadLen === 127) {
    if (buffer.length < 10) return null;
    // 忽略高4字节（实际上 JS 不能处理超大数）
    payloadLen = buffer.readUInt32BE(6);
    offset = 10;
  }

  // 掩码密钥
  let maskingKey = null;
  if (masked) {
    if (buffer.length < offset + 4) return null;
    maskingKey = buffer.slice(offset, offset + 4);
    offset += 4;
  }

  // 负载数据
  if (buffer.length < offset + payloadLen) return null;

  const rawPayload = buffer.slice(offset, offset + payloadLen);
  
  // 解掩码
  let payload;
  if (masked && maskingKey) {
    payload = Buffer.allocUnsafe(payloadLen);
    for (let i = 0; i < payloadLen; i++) {
      payload[i] = rawPayload[i] ^ maskingKey[i % 4];
    }
  } else {
    payload = rawPayload;
  }

  return {
    fin,
    rsv1, rsv2, rsv3,
    opcode,
    masked,
    payloadLen,
    payload,
    totalLength: offset + payloadLen, // 帧在 buffer 中占用的总字节数
  };
}

// ─── WebSocket 连接管理 ────────────────────────────────────────────────────────

class WebSocketConnection {
  constructor(socket, id) {
    this.socket = socket;
    this.id = id;
    this.isAlive = true;
    this.buffer = Buffer.alloc(0); // 接收缓冲区
    this.messageFragments = [];    // 分片消息缓冲
  }

  /** 发送文本消息 */
  send(text) {
    const frame = encodeFrame(OPCODE.TEXT, text);
    this.socket.write(frame);
  }

  /** 发送二进制消息 */
  sendBinary(data) {
    const frame = encodeFrame(OPCODE.BINARY, data);
    this.socket.write(frame);
  }

  /** 发送 Ping */
  ping(data = '') {
    const frame = encodeFrame(OPCODE.PING, data);
    this.socket.write(frame);
  }

  /** 发送 Pong */
  pong(data = '') {
    const frame = encodeFrame(OPCODE.PONG, data);
    this.socket.write(frame);
  }

  /** 关闭连接 */
  close(code = 1000, reason = '') {
    const payload = Buffer.allocUnsafe(2 + Buffer.byteLength(reason));
    payload.writeUInt16BE(code, 0);
    Buffer.from(reason).copy(payload, 2);
    const frame = encodeFrame(OPCODE.CLOSE, payload);
    this.socket.write(frame, () => this.socket.end());
  }

  /** 处理接收到的 TCP 数据 */
  receiveData(chunk, handlers) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    
    // 循环处理缓冲区中的完整帧
    while (this.buffer.length > 0) {
      const frame = decodeFrame(this.buffer);
      if (!frame) break; // 数据不完整，等待更多数据
      
      this.buffer = this.buffer.slice(frame.totalLength); // 消费已解析的帧
      this._handleFrame(frame, handlers);
    }
  }

  _handleFrame(frame, handlers) {
    const opName = OPCODE_NAMES[frame.opcode] || `0x${frame.opcode.toString(16)}`;
    
    switch (frame.opcode) {
      case OPCODE.TEXT:
      case OPCODE.BINARY: {
        if (!frame.fin) {
          // 消息分片
          this.messageFragments.push(frame.payload);
          break;
        }
        
        // 合并分片
        let message;
        if (this.messageFragments.length > 0) {
          this.messageFragments.push(frame.payload);
          message = Buffer.concat(this.messageFragments);
          this.messageFragments = [];
        } else {
          message = frame.payload;
        }
        
        const text = frame.opcode === OPCODE.TEXT ? message.toString('utf8') : message;
        handlers.onMessage?.(text, frame.opcode === OPCODE.BINARY);
        break;
      }
        
      case OPCODE.CONTINUATION: {
        this.messageFragments.push(frame.payload);
        if (frame.fin) {
          const message = Buffer.concat(this.messageFragments);
          this.messageFragments = [];
          handlers.onMessage?.(message.toString('utf8'), false);
        }
        break;
      }
        
      case OPCODE.PING:
        this.pong(frame.payload.toString()); // 必须立即回应 Pong
        handlers.onPing?.();
        break;
        
      case OPCODE.PONG:
        this.isAlive = true;
        handlers.onPong?.();
        break;
        
      case OPCODE.CLOSE: {
        let code = 1000;
        let reason = '';
        if (frame.payload.length >= 2) {
          code = frame.payload.readUInt16BE(0);
          reason = frame.payload.slice(2).toString('utf8');
        }
        handlers.onClose?.(code, reason);
        this.socket.end();
        break;
      }
        
      default:
        console.warn(`[WS#${this.id}] Unknown opcode: ${opName}`);
    }
  }
}

// ─── WebSocket 服务器 ──────────────────────────────────────────────────────────

const clients = new Map(); // id → WebSocketConnection
let nextId = 1;

const server = net.createServer((socket) => {
  socket.setTimeout(60000); // 60秒无活动超时
  let wsConn = null;
  let handshakeDone = false;
  let handshakeBuffer = Buffer.alloc(0);

  socket.on('data', (chunk) => {
    if (!handshakeDone) {
      // 握手阶段：收集 HTTP 请求数据
      handshakeBuffer = Buffer.concat([handshakeBuffer, chunk]);
      const hs = parseHandshake(handshakeBuffer);
      
      if (!hs) return; // 等待更多数据
      
      // 执行握手
      const acceptKey = computeAcceptKey(hs.wsKey);
      console.log(`\n[握手] 新连接 ${socket.remoteAddress}:${socket.remotePort}`);
      console.log(`  Sec-WebSocket-Key: ${hs.wsKey}`);
      console.log(`  Sec-WebSocket-Accept: ${acceptKey}`);
      console.log(`  子协议请求: ${hs.protocols.join(', ') || '无'}`);
      
      const protocol = hs.protocols.includes('echo') ? 'echo' : null;
      socket.write(buildUpgradeResponse(hs.wsKey, protocol));
      
      // 创建 WebSocket 连接对象
      const id = nextId++;
      wsConn = new WebSocketConnection(socket, id);
      clients.set(id, wsConn);
      handshakeDone = true;
      
      console.log(`[连接] WS#${id} 已建立（共 ${clients.size} 个连接）`);
      
      // 发送欢迎消息
      wsConn.send(JSON.stringify({ type: 'welcome', id, message: '连接成功！这是从零实现的 WebSocket 服务器 🎉' }));
      
      // 处理握手 buffer 中剩余的 WS 帧数据
      const remaining = handshakeBuffer.slice(handshakeBuffer.indexOf('\r\n\r\n') + 4);
      if (remaining.length > 0) {
        wsConn.receiveData(remaining, makeHandlers(wsConn));
      }
      
      return;
    }
    
    // WebSocket 数据阶段
    wsConn.receiveData(chunk, makeHandlers(wsConn));
  });

  socket.on('end', () => {
    if (wsConn) {
      clients.delete(wsConn.id);
      console.log(`[断开] WS#${wsConn.id} 已断开（剩余 ${clients.size} 个连接）`);
    }
  });
  
  socket.on('error', (err) => {
    if (err.code !== 'ECONNRESET') {
      console.error(`[Socket Error]:`, err.message);
    }
    if (wsConn) {
      clients.delete(wsConn.id);
    }
  });
  
  socket.on('timeout', () => {
    console.log(`[超时] ${socket.remoteAddress} 60秒无活动，断开连接`);
    if (wsConn) wsConn.close(1001, 'Timeout');
    else socket.end();
  });
});

function makeHandlers(conn) {
  return {
    onMessage(text, isBinary) {
      if (isBinary) {
        console.log(`[WS#${conn.id}] 收到二进制消息: ${conn.id} bytes`);
        conn.sendBinary(text); // echo back
        return;
      }
      
      console.log(`[WS#${conn.id}] 收到: ${text}`);
      
      // 处理特殊命令
      let parsed;
      try { parsed = JSON.parse(text); } catch (_) {}
      
      if (parsed?.type === 'broadcast') {
        // 广播给所有客户端
        const msg = JSON.stringify({ type: 'broadcast', from: conn.id, message: parsed.message });
        clients.forEach(c => c.send(msg));
        console.log(`[WS#${conn.id}] 广播: "${parsed.message}" → ${clients.size} 个客户端`);
      } else {
        // Echo 模式
        conn.send(`Echo: ${text}`);
      }
    },
    
    onPing() {
      console.log(`[WS#${conn.id}] 收到 Ping，自动回复 Pong`);
    },
    
    onPong() {
      console.log(`[WS#${conn.id}] 收到 Pong ✓`);
    },
    
    onClose(code, reason) {
      console.log(`[WS#${conn.id}] 客户端发送 Close 帧: code=${code} reason="${reason}"`);
      clients.delete(conn.id);
    },
  };
}

// ─── 心跳检测 ──────────────────────────────────────────────────────────────────

const HEARTBEAT_INTERVAL = 30000; // 30 秒
const heartbeatTimer = setInterval(() => {
  if (clients.size === 0) return;
  
  console.log(`\n[心跳] 检查 ${clients.size} 个连接...`);
  clients.forEach((conn, id) => {
    if (!conn.isAlive) {
      console.log(`[心跳] WS#${id} 无响应，断开`);
      conn.socket.destroy();
      clients.delete(id);
      return;
    }
    conn.isAlive = false;
    conn.ping('heartbeat');
  });
}, HEARTBEAT_INTERVAL);

// ─── 启动 ──────────────────────────────────────────────────────────────────────

const PORT = 8765;
server.listen(PORT, () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔌 从零实现的 WebSocket Server（无外部依赖）');
  console.log(`   ws://localhost:${PORT}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n测试方法:');
  console.log('1. 安装 wscat: npm install -g wscat');
  console.log(`   wscat -c ws://localhost:${PORT}`);
  console.log('\n2. 浏览器控制台:');
  console.log(`   const ws = new WebSocket('ws://localhost:${PORT}');`);
  console.log("   ws.onmessage = e => console.log(JSON.parse(e.data));");
  console.log("   ws.send('Hello!');");
  console.log("   ws.send(JSON.stringify({type:'broadcast',message:'Hi all!'}));");
  console.log('\n关键实现点:');
  console.log('  ✓ SHA1 + Base64 计算 Sec-WebSocket-Accept');
  console.log('  ✓ 帧格式：FIN, opcode, MASK, payload length (7/16/64 bit)');
  console.log('  ✓ XOR 解掩码（客户端→服务端必须有掩码）');
  console.log('  ✓ Ping/Pong 心跳');
  console.log('  ✓ 消息分片 (Continuation frames)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});

process.on('SIGINT', () => {
  console.log('\n\n👋 关闭 WebSocket 服务器...');
  clearInterval(heartbeatTimer);
  clients.forEach(conn => conn.close(1001, 'Server shutdown'));
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});
