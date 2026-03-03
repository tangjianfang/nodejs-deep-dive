# OAuth2 与 OIDC 深度解析

## 1. OAuth2 核心概念

```
角色:
  Resource Owner  → 用户（拥有数据）
  Client          → 应用（想访问数据）
  Authorization Server → 认证服务器（颁发 token）
  Resource Server → API 服务器（持有受保护资源）

四种授权类型（Grant Types）:
  1. Authorization Code + PKCE  ← Web/移动端推荐
  2. Client Credentials         ← 服务间通信
  3. ~~Implicit~~               ← 已废弃（不安全）
  4. ~~Resource Owner Password~~← 不推荐
```

---

## 2. Authorization Code + PKCE 流程

```
用户浏览器                应用(Client)           认证服务器(AS)
    │                       │                        │
    │─── 点击"GitHub登录" ──→│                        │
    │                       │ 生成 code_verifier      │
    │                       │ code_challenge =        │
    │                       │   BASE64URL(SHA256(cv)) │
    │                       │                        │
    │←── 重定向到 AS ────────│                        │
    │    ?client_id=xxx      │                        │
    │    &redirect_uri=xxx   │                        │
    │    &code_challenge=xxx │                        │
    │    &state=random_nonce │                        │
    │                                                 │
    │──── 用户登录并授权 ────────────────────────────→│
    │                                                 │
    │←─── 重定向回应用 ───────────────────────────────│
    │     ?code=AUTH_CODE&state=...                   │
    │                       │                        │
    │                       │── POST /token ─────────→│
    │                       │   code=AUTH_CODE        │
    │                       │   code_verifier=cv      │
    │                       │   (AS 验证 SHA256(cv)==challenge)
    │                       │                        │
    │                       │←── access_token ────────│
    │                       │    refresh_token        │
    │                       │    id_token (OIDC)      │
```

**PKCE 的作用**：防止授权码拦截攻击（code 被截获但没有 verifier 无法换 token）

---

## 3. OIDC（OpenID Connect）

OAuth2 解决**授权**（Authorization），OIDC 在此基础上增加**身份认证**（Authentication）。

```
OIDC = OAuth2 + ID Token + UserInfo Endpoint

ID Token（JWT 格式）:
{
  "iss": "https://accounts.google.com",  ← 签发者
  "sub": "1234567890",                   ← 用户唯一 ID
  "aud": "my-app-client-id",             ← 受众（Client ID）
  "iat": 1700000000,
  "exp": 1700003600,
  "email": "user@gmail.com",
  "name": "Alice"
}

Scope:
  openid        → 基础（获取 ID Token）
  profile       → 姓名、头像等
  email         → 邮箱
  offline_access → 获取 refresh_token
```

---

## 4. Client Credentials Flow（服务间通信）

```javascript
// 微服务 A 调用微服务 B 的 API
const response = await fetch('https://auth.example.com/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'client_credentials',
    client_id:     'service-a-id',
    client_secret: 'service-a-secret',
    scope: 'read:orders write:inventory',
  }),
});
const { access_token, expires_in } = await response.json();

// 调用 API（缓存 token 直到过期）
```

---

## 5. 常见安全问题

| 问题 | 原因 | 防御 |
|------|------|------|
| CSRF | 没有 state 参数 | 使用随机 state，回调时验证 |
| 开放重定向 | redirect_uri 未严格校验 | 白名单精确匹配 |
| token 泄露 | URL 中的 token 被记录 | 使用 Authorization Code，不用 Implicit |
| 授权码重用 | Code 可以多次使用 | Code 一次性（AS 负责） |

---

## 6. 实践 Checklist

- [ ] 手动实现 PKCE：生成 code_verifier，计算 code_challenge
- [ ] 用 Google OAuth2 实现第三方登录（Authorization Code + PKCE）
- [ ] 解析 ID Token（验证签名、iss、aud、exp）
- [ ] 实现 Client Credentials flow（服务间 M2M 认证）
