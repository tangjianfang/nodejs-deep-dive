# Node.js 加密原理深度解析

## 1. 加密基本概念

```
对称加密（Symmetric）:
  明文 → [加密] → 密文 → [解密] → 明文
  同一把钥匙加密和解密
  算法: AES-256-GCM, ChaCha20-Poly1305
  特点: 快，适合大量数据
  问题: 密钥分发（如何安全地传递密钥？）

非对称加密（Asymmetric）:
  公钥加密 → 私钥解密（加密通信）
  私钥签名 → 公钥验证（数字签名）
  算法: RSA-2048/4096, ECDSA (P-256)
  特点: 慢，适合少量数据（如密钥交换）

混合加密（TLS 使用的方式）:
  1. 用非对称加密交换一个随机的对称密钥
  2. 后续通信用对称密钥加密（性能好）
```

---

## 2. Node.js `crypto` 模块

### 2.1 哈希（Hash）

```javascript
const { createHash } = require('crypto');

// SHA-256（单向，不可逆）
const hash = createHash('sha256')
  .update('hello')
  .digest('hex');

// 文件哈希（流式）
const fileHash = createHash('sha256');
fs.createReadStream('./file.txt').pipe(fileHash);
fileHash.on('finish', () => console.log(fileHash.digest('hex')));
```

### 2.2 HMAC（带密钥的哈希）

```javascript
const { createHmac } = require('crypto');

const hmac = createHmac('sha256', 'my-secret-key')
  .update('message')
  .digest('hex');

// 用于 JWT HS256 签名、Webhook 签名验证
```

### 2.3 AES-256-GCM（认证加密）

```javascript
const { createCipheriv, createDecipheriv, randomBytes } = require('crypto');

function encrypt(plaintext, key) {
  const iv = randomBytes(12);         // GCM 推荐 96-bit IV
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(plaintext, 'utf8')),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag(); // 认证标签（防篡改）
  return { iv, encrypted, authTag };
}

function decrypt({ iv, encrypted, authTag }, key) {
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString('utf8');
}

const key = randomBytes(32); // 256 bits
const result = encrypt('Hello, World!', key);
console.log(decrypt(result, key)); // Hello, World!
```

### 2.4 RSA（非对称）

```javascript
const { generateKeyPairSync, privateEncrypt, publicDecrypt,
        createSign, createVerify } = require('crypto');

// 生成密钥对
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding:  { type: 'spki',  format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// 数字签名
const sign = createSign('SHA256').update('message').sign(privateKey, 'base64');
const valid = createVerify('SHA256').update('message').verify(publicKey, sign, 'base64');
```

---

## 3. 密码存储

```javascript
// ❌ 错误: 明文或简单哈希
password = "abc123"
password_hash = sha256("abc123")  // 可被彩虹表攻击

// ✅ 正确: bcrypt / Argon2（慢哈希 + salt）
// npm install bcrypt
const bcrypt = require('bcrypt');
const hash = await bcrypt.hash(password, 12); // cost factor 12
const valid = await bcrypt.compare(password, hash);

// Argon2（更现代，更安全）
// npm install argon2
const argon2 = require('argon2');
const hash = await argon2.hash(password, { type: argon2.argon2id });
const valid = await argon2.verify(hash, password);
```

---

## 4. 常见攻击与防御

| 攻击类型 | 原理 | 防御方案 |
|---------|------|---------|
| 时序攻击 | 比较字符串时间泄露信息 | `crypto.timingSafeEqual()` |
| 彩虹表 | 预计算哈希反查 | bcrypt/Argon2（自带 salt）|
| 重放攻击 | 重用已捕获的有效请求 | nonce + 时间戳 |
| MITM | 中间人篡改通信 | TLS + 证书固定 |

```javascript
// 时序安全比较
const crypto = require('crypto');
const a = Buffer.from('expected_token');
const b = Buffer.from(userInput);
if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
  // 安全
}
```

---

## 5. 实践 Checklist

- [ ] 用 `crypto` 实现 AES-256-GCM 加密解密（含 IV 和 AuthTag）
- [ ] 生成 RSA-2048 密钥对，实现签名与验证
- [ ] 理解 bcrypt cost factor 对性能和安全的影响
- [ ] 用 `timingSafeEqual` 替换 `===` 进行 token 比较
