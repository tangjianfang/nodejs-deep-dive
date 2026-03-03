# gRPC 与 Protobuf 深度解析

## 1. gRPC vs REST

| 特性 | REST (JSON) | gRPC (Protobuf) |
|------|------------|-----------------|
| 协议 | HTTP/1.1 | HTTP/2 |
| 序列化 | JSON（文本）| Protobuf（二进制）|
| 大小 | 较大 | 小 3-10x |
| 速度 | 较慢 | 快 2-7x |
| 类型安全 | 手动（OpenAPI）| 自动（.proto 文件）|
| 流式传输 | 困难 | 原生支持 |
| 浏览器支持 | ✅ | 需要 grpc-web |
| 适用场景 | 公开 API | 服务间通信 |

---

## 2. Protobuf 定义

```protobuf
// user.proto
syntax = "proto3";
package user;

service UserService {
  rpc GetUser       (GetUserRequest)       returns (User);
  rpc CreateUser    (CreateUserRequest)    returns (User);
  rpc ListUsers     (ListUsersRequest)     returns (stream User);    // 服务端流
  rpc WatchUsers    (stream UserEvent)     returns (stream User);    // 双向流
}

message User {
  uint32 id    = 1;
  string name  = 2;
  string email = 3;
  repeated string roles = 4;   // 数组
  uint64 created_at = 5;
}

message GetUserRequest  { uint32 id = 1; }
message CreateUserRequest { string name = 1; string email = 2; }
message ListUsersRequest { uint32 page = 1; uint32 page_size = 2; }
message UserEvent { string type = 1; }
```

---

## 3. Node.js gRPC 实现

```javascript
// npm install @grpc/grpc-js @grpc/proto-loader

const grpc       = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const packageDef = protoLoader.loadSync('user.proto', {
  keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
});
const proto = grpc.loadPackageDefinition(packageDef).user;

// ─── 服务端 ──────────────────────────────
const server = new grpc.Server();

server.addService(proto.UserService.service, {
  async getUser(call, callback) {
    const { id } = call.request;
    const user = await db.findById(id);
    if (!user) {
      return callback({ code: grpc.status.NOT_FOUND, message: `User ${id} not found` });
    }
    callback(null, user);
  },

  async listUsers(call) {
    const users = await db.findAll();
    for (const user of users) {
      call.write(user);      // 流式写入
    }
    call.end();
  },
});

server.bindAsync('0.0.0.0:50051', grpc.ServerCredentials.createInsecure(), () => {
  server.start();
});

// ─── 客户端 ──────────────────────────────
const client = new proto.UserService('localhost:50051', grpc.credentials.createInsecure());

// 一元 RPC
client.getUser({ id: 1 }, (err, user) => {
  if (err) return console.error(err);
  console.log(user);
});

// 服务端流
const stream = client.listUsers({ page: 1, page_size: 10 });
stream.on('data', (user) => console.log(user));
stream.on('end', () => console.log('Stream ended'));
```

---

## 4. Protobuf 序列化原理

```
JSON: { "id": 1, "name": "Alice", "email": "alice@example.com" }
       → 48 字节

Protobuf wire format:
  Field 1 (id=1):    0x08 0x01
  Field 2 (name):    0x12 0x05 Alice
  Field 3 (email):   0x1A 0x11 alice@example.com
  → 约 26 字节（约小 46%）

类型编码 (wire type):
  0 = Varint (int32, int64, bool, enum)
  1 = 64-bit (fixed64, double)
  2 = Length-delimited (string, bytes, message)
  5 = 32-bit (fixed32, float)

Field tag = (field_number << 3) | wire_type
  id=1 → (1 << 3) | 0 = 0x08
```

---

## 5. 实践 Checklist

- [ ] 编写 .proto 文件，实现一元和服务端流 RPC
- [ ] 用 Postman 或 grpcurl 测试 gRPC 接口
- [ ] 对比 JSON vs Protobuf 序列化大小
- [ ] 实现 gRPC 拦截器（日志、认证）
