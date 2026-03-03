# Month 07 — 认证与安全

## 学习目标

深入理解 JWT、OAuth2/OIDC、密码学基础，以及 Node.js 应用的常见安全漏洞防御。

---

## 进度追踪

| # | 任务 | 类型 | 状态 | 完成日期 |
|---|------|------|------|---------|
| 1 | 阅读 jwt-and-auth.md | 笔记 | ⬜ | |
| 2 | 阅读 cryptography.md | 笔记 | ⬜ | |
| 3 | 阅读 oauth2-and-oidc.md | 笔记 | ⬜ | |
| 4 | 运行 demo-jwt-rs256.js | 实践 | ⬜ | |
| 5 | 运行 demo-crypto.js | 实践 | ⬜ | |
| 6 | 运行 demo-oauth2-flow.js | 实践 | ⬜ | |
| 7 | 完成月度分享 slides.md | 输出 | ⬜ | |

---

## 核心概念速览

```
JWT 结构:
  header.payload.signature
  eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjMifQ.签名

OAuth2 Authorization Code Flow:
  User → App → Auth Server → Code → Token → API
```

## 参考资料

- [JWT 官网](https://jwt.io)
- [OAuth 2.0 RFC 6749](https://tools.ietf.org/html/rfc6749)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Crypto 文档](https://nodejs.org/api/crypto.html)
