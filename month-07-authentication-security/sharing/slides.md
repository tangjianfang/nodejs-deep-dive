# 第七月分享：认证安全全景图 — JWT、OAuth2 与常见攻击防御

---

## Slide 1 — 封面

```
认证安全全景图
JWT、OAuth2 与常见攻击防御

Month 07 · Node.js Deep Dive
```

🗣️ 今天我们聊安全。安全是后端工程师最容易忽视但代价最高的领域。
**互动：大家的项目用什么认证方案？JWT 还是 Session？**

---

## Slide 2 — JWT 结构与陷阱

```
header.payload.signature
  ↑       ↑        ↑
Base64  Base64   RSA/HMAC
URL     URL      签名

⚠️ Payload 不是加密的！
atob(payload) → 明文 JSON
→ 不要放 密码、信用卡、PII 数据
```

🗣️ 演示 `demo-jwt-rs256.js`，现场解码 token payload。

---

## Slide 3 — HS256 vs RS256

```
HS256（对称）:           RS256（非对称）:
  一个 secret            私钥签名 → 公钥验证
  谁有 secret 谁能签     多个服务共享公钥，不能伪造
  
微服务中:
  HS256: 所有服务都要知道 secret → 泄露面大
  RS256: 各服务只需公钥 → 更安全
         Auth Service 持有私钥 → 唯一能签发的
```

🗣️ 展示 RS256 签名和公钥验证的代码差异。

---

## Slide 4 — JWT 三大攻击

```
1. alg:none 攻击
   把 header 改为 {"alg":"none"}，去掉签名
   → 防御: algorithms: ['RS256']

2. 算法混淆 (RS256 → HS256)
   用公钥当 HMAC secret 签名
   → 防御: 显式指定算法

3. Payload 明文泄露
   Payload 只是 Base64，不是加密
   → 防御: 不放敏感数据 / 用 JWE
```

🗣️ 演示 alg:none 攻击与防御代码。

---

## Slide 5 — OAuth2 PKCE 流程

```
Browser         App(Client)        Auth Server
   │               │                    │
   │ 点击登录       │                    │
   │──────────────→│ 生成 verifier/challenge
   │←─ 重定向 ─────│                    │
   │                                    │
   │ 用户授权 ─────────────────────────→│
   │←─ 回调 code ───────────────────────│
   │               │←─ code+verifier ──→│
   │               │  验证 SHA256 ✅     │
   │               │←─── access_token ──│
```

🗣️ 演示 `demo-oauth2-flow.js`，展示完整 PKCE 流程。

---

## Slide 6 — 加密工具箱

```
场景              → 推荐算法
─────────────────────────────────
对称加密           → AES-256-GCM
密码存储           → scrypt / Argon2id
数字签名           → RSA-2048 / ECDSA P-256
消息认证           → HMAC-SHA256
随机 token        → crypto.randomBytes(32)
时序安全比较       → crypto.timingSafeEqual()
```

🗣️ 演示 `demo-crypto.js`，展示各种加密操作。

---

## Slide 7 — 下月预告：测试与调试

```
Month 08: 测试与调试的艺术
  Jest 高级用法（mock、spy、fake timer）
  集成测试（supertest + testcontainers）
  内存泄漏排查（heapdump + Chrome DevTools）
  CPU profile 分析（--prof + 火焰图）
```

🗣️ **提问：大家项目的测试覆盖率是多少？有没有遇到难以定位的内存泄漏？**
