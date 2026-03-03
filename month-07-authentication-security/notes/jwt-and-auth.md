# JWT 深度解析

## 1. JWT 结构

```
header.payload.signature

eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9
.eyJzdWIiOiJ1c2VyMTIzIiwicm9sZSI6ImFkbWluIiwiaWF0IjoxNzAwMDAwMDAwLCJleHAiOjE3MDAwMDM2MDB9
.（签名）

Header（Base64URL）:
  { "alg": "RS256", "typ": "JWT" }

Payload（Base64URL，非加密！）:
  {
    "sub": "user123",       ← 主体（用户 ID）
    "role": "admin",        ← 自定义 claim
    "iat": 1700000000,      ← 签发时间
    "exp": 1700003600,      ← 过期时间（1小时后）
    "iss": "auth.myapp.com" ← 签发方
    "aud": "api.myapp.com"  ← 受众
  }

Signature:
  RS256: RSA_SIGN(SHA256(base64url(header) + '.' + base64url(payload)), privateKey)
  HS256: HMAC_SHA256(base64url(header) + '.' + base64url(payload), secret)
```

---

## 2. HS256 vs RS256

| 特性 | HS256（对称）| RS256（非对称）|
|------|-------------|---------------|
| 算法 | HMAC-SHA256 | RSA + SHA256 |
| 密钥 | 一个 secret | 私钥签名 / 公钥验证 |
| 验证方能否签发 | ✅ 能（危险！）| ❌ 不能 |
| 适用场景 | 单体应用 | 微服务、多方验证 |
| 性能 | 快 | 稍慢（RSA 运算）|
| JWKS 端点 | 不适用 | ✅ 支持公钥分发 |

**微服务架构首选 RS256**：API 服务只需公钥验证，无法伪造 token。

---

## 3. JWT 常见陷阱

### 3.1 alg: none 攻击

```javascript
// 攻击者修改 header
{ "alg": "none", "typ": "JWT" }
// 然后去掉 signature
// 如果服务器接受 alg: none → 任何 payload 都有效！

// 防御: 显式指定允许的算法
jwt.verify(token, secret, { algorithms: ['RS256'] }); // 不允许 'none'
```

### 3.2 算法混淆攻击

```javascript
// RS256 → HS256 混淆
// 攻击者: 把 header alg 改为 HS256
// 用公钥（已公开！）作为 HMAC secret 签名
// 如果服务器用公钥做 HMAC 验证 → 通过！

// 防御: 同上，显式传入 algorithms 数组
```

### 3.3 Payload 未加密

```javascript
// 错误认知：JWT 是加密的
atob('eyJzdWIiOiJ1c2VyMTIzIn0=') // → {"sub":"user123"}
// Payload 只是 Base64URL，任何人都能解码！
// 不要在 Payload 中放敏感数据（密码、信用卡号等）
```

---

## 4. Token 刷新策略

```
Access Token（短期，15分钟）+ Refresh Token（长期，7天）

登录流程:
  Client → POST /login
  Server → { accessToken: "...", refreshToken: "..." }

API 调用:
  Client → GET /api/data + Authorization: Bearer <accessToken>
  Server → 验证 accessToken，返回数据

刷新流程:
  Client（accessToken 过期）→ POST /auth/refresh + refreshToken
  Server → 验证 refreshToken（查数据库确认未撤销）
         → 返回新 accessToken（+ 可选新 refreshToken）

撤销 Refresh Token（退出登录）:
  将 refreshToken 加入黑名单（Redis SET）
  或使用数据库标记 invalidated = true
```

---

## 5. 实践 Checklist

- [ ] 生成 RSA 密钥对，实现 RS256 签发与验证
- [ ] 理解 alg 参数的安全影响，始终显式指定 algorithms
- [ ] 实现 Access Token + Refresh Token 双 token 机制
- [ ] 实现 Refresh Token 轮转（每次刷新颁发新 RT）
- [ ] 用 Redis 实现 Refresh Token 黑名单（登出功能）
