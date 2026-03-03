/**
 * demo-grpc.js
 * gRPC 概念演示（不依赖 grpc 库，使用 HTTP/2 内置模块模拟）
 * 展示 Protobuf 编码、一元 RPC、服务端流的核心逻辑
 *
 * 如需真实 gRPC:
 *   npm install @grpc/grpc-js @grpc/proto-loader
 */

'use strict';

// ─── 简化版 Protobuf 编码器/解码器 ────────────────────────────────────────────

class ProtoEncoder {
  static encodeVarint(value) {
    const bytes = [];
    while (value > 0x7F) {
      bytes.push((value & 0x7F) | 0x80);
      value >>>= 7;
    }
    bytes.push(value & 0x7F);
    return Buffer.from(bytes);
  }

  static encodeField(fieldNumber, wireType, value) {
    const tag = (fieldNumber << 3) | wireType;
    const tagBuf = this.encodeVarint(tag);

    if (wireType === 0) { // Varint
      return Buffer.concat([tagBuf, this.encodeVarint(value)]);
    }
    if (wireType === 2) { // Length-delimited (string/bytes)
      const valBuf = Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8');
      return Buffer.concat([tagBuf, this.encodeVarint(valBuf.length), valBuf]);
    }
    throw new Error(`Unsupported wire type: ${wireType}`);
  }

  // 编码 User 消息 { id: uint32, name: string, email: string }
  static encodeUser({ id, name, email }) {
    return Buffer.concat([
      this.encodeField(1, 0, id),                    // field 1: id (varint)
      this.encodeField(2, 2, name),                  // field 2: name (string)
      this.encodeField(3, 2, email),                 // field 3: email (string)
    ]);
  }

  static decodeVarint(buf, offset = 0) {
    let result = 0, shift = 0;
    while (true) {
      const byte = buf[offset++];
      result |= (byte & 0x7F) << shift;
      shift += 7;
      if (!(byte & 0x80)) break;
    }
    return { value: result, offset };
  }

  static decodeUser(buf) {
    const user = {};
    let offset = 0;
    while (offset < buf.length) {
      const { value: tag, offset: o1 } = this.decodeVarint(buf, offset);
      offset = o1;
      const fieldNumber = tag >> 3;
      const wireType    = tag & 0x07;

      if (wireType === 0) {
        const { value, offset: o2 } = this.decodeVarint(buf, offset);
        offset = o2;
        if (fieldNumber === 1) user.id = value;
      } else if (wireType === 2) {
        const { value: len, offset: o2 } = this.decodeVarint(buf, offset);
        offset = o2;
        const strBuf = buf.slice(offset, offset + len);
        offset += len;
        if (fieldNumber === 2) user.name  = strBuf.toString('utf8');
        if (fieldNumber === 3) user.email = strBuf.toString('utf8');
      }
    }
    return user;
  }
}

// ─── 演示 Protobuf 编解码 ──────────────────────────────────────────────────────

console.log('=== Demo 1：Protobuf 序列化对比 ===\n');

const user = { id: 42, name: 'Alice', email: 'alice@example.com' };

const jsonBytes  = Buffer.from(JSON.stringify(user), 'utf8');
const protoBytes = ProtoEncoder.encodeUser(user);

console.log('原始数据:',  user);
console.log('\nJSON 序列化:');
console.log(`  ${jsonBytes.toString()}`);
console.log(`  大小: ${jsonBytes.length} 字节`);

console.log('\nProtobuf 序列化:');
console.log(`  ${protoBytes.toString('hex').match(/.{1,2}/g).join(' ')}`);
console.log(`  大小: ${protoBytes.length} 字节`);
console.log(`\n压缩率: ${((1 - protoBytes.length / jsonBytes.length) * 100).toFixed(1)}% 更小`);

// 验证解码
const decoded = ProtoEncoder.decodeUser(protoBytes);
console.log('\n解码结果:', decoded);
console.log('解码一致性:', JSON.stringify(decoded) === JSON.stringify(user));

// ─── 模拟 gRPC 服务（使用 Node.js HTTP/2）────────────────────────────────────

const http2 = require('http2');

// 模拟 gRPC 服务端
async function startGrpcServer() {
  const server = http2.createServer();
  const users = [
    { id: 1, name: 'Alice', email: 'alice@example.com' },
    { id: 2, name: 'Bob',   email: 'bob@example.com' },
    { id: 3, name: 'Carol', email: 'carol@example.com' },
  ];

  server.on('stream', (stream, headers) => {
    const path = headers[':path'];

    // gRPC 格式: Content-Type: application/grpc
    stream.respond({ ':status': 200, 'content-type': 'application/grpc' });

    if (path === '/user.UserService/GetUser') {
      // 一元 RPC
      const chunks = [];
      stream.on('data', c => chunks.push(c));
      stream.on('end', () => {
        const body = Buffer.concat(chunks);
        // gRPC 帧格式: 1 byte (compressed flag) + 4 bytes (length) + data
        const msgBuf = body.slice(5);
        const { value: userId } = ProtoEncoder.decodeVarint(msgBuf, 1);
        const user = users.find(u => u.id === userId) || { id: 0, name: 'Not found', email: '' };
        const responseData = ProtoEncoder.encodeUser(user);
        const frame = Buffer.allocUnsafe(5 + responseData.length);
        frame.writeUInt8(0, 0);                      // 未压缩
        frame.writeUInt32BE(responseData.length, 1); // 消息长度
        responseData.copy(frame, 5);
        stream.end(frame);
      });
    } else if (path === '/user.UserService/ListUsers') {
      // 服务端流
      (async () => {
        for (const user of users) {
          const data = ProtoEncoder.encodeUser(user);
          const frame = Buffer.allocUnsafe(5 + data.length);
          frame.writeUInt8(0, 0);
          frame.writeUInt32BE(data.length, 1);
          data.copy(frame, 5);
          stream.write(frame);
          await new Promise(r => setTimeout(r, 50));
        }
        stream.end();
      })();
    }
  });

  await new Promise(resolve => server.listen(50052, resolve));
  return server;
}

// gRPC 客户端请求
function grpcCall(path, requestData) {
  return new Promise((resolve, reject) => {
    const client = http2.connect('http://localhost:50052');
    const stream = client.request({
      ':method': 'POST',
      ':path':   path,
      'content-type': 'application/grpc',
    });

    const frame = Buffer.allocUnsafe(5 + requestData.length);
    frame.writeUInt8(0, 0);
    frame.writeUInt32BE(requestData.length, 1);
    requestData.copy(frame, 5);
    stream.write(frame);
    stream.end();

    const responses = [];
    stream.on('data', chunk => {
      const msgLen = chunk.readUInt32BE(1);
      const msgBuf = chunk.slice(5, 5 + msgLen);
      responses.push(ProtoEncoder.decodeUser(msgBuf));
    });
    stream.on('end', () => { client.close(); resolve(responses); });
    stream.on('error', err => { client.close(); reject(err); });
  });
}

// 主演示
(async () => {
  console.log('\n=== Demo 2：模拟 gRPC 服务 ===\n');

  const server = await startGrpcServer();

  // 一元 RPC: GetUser(id=2)
  const getUserReq = ProtoEncoder.encodeField(1, 0, 2); // field 1 = id = 2
  const [user2] = await grpcCall('/user.UserService/GetUser', getUserReq);
  console.log('GetUser(id=2):', user2);

  // 服务端流: ListUsers
  console.log('\nListUsers（服务端流）:');
  const emptyReq = Buffer.alloc(0);
  const allUsers = await grpcCall('/user.UserService/ListUsers', emptyReq);
  allUsers.forEach(u => console.log('  ', u));

  server.close();
  console.log('\n✅ gRPC 演示完成');
  console.log('\n真实项目使用: npm install @grpc/grpc-js @grpc/proto-loader');
})().catch(console.error);
