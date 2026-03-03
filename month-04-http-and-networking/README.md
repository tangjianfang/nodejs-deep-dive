# Month 04 — HTTP & Networking

> **学习周期**：第 13 ~ 16 周  
> **核心主题**：HTTP/1.1 vs HTTP/2、TCP 协议栈、WebSocket、TLS/HTTPS、Node.js net 模块  
> **技术栈**：Node.js `http`/`http2`/`net`/`tls` 内置模块

---

## 任务进度

| # | 任务 | 类型 | 状态 | 完成日期 |
|---|------|------|------|----------|
| 1 | HTTP 协议精讲（请求/响应、状态码、头部） | 笔记 | ⬜ | — |
| 2 | HTTP/2 特性与 TLS 原理 | 笔记 | ⬜ | — |
| 3 | WebSocket 协议与实现 | 笔记 | ⬜ | — |
| 4 | Demo：手写 mini HTTP 服务器 | 脚本 | ⬜ | — |
| 5 | Demo：WebSocket 聊天室 | 脚本 | ⬜ | — |
| 6 | Demo：HTTP/2 Server Push 实验 | 脚本 | ⬜ | — |
| 7 | 月度分享 slides | 分享 | ⬜ | — |

---

## 目录结构

```
month-04-http-and-networking/
├── README.md
├── notes/
│   ├── http-internals.md         # HTTP/1.1 深度解析
│   ├── http2-and-tls.md          # HTTP/2 + HTTPS 原理
│   ├── websocket.md              # WebSocket 协议
│   └── scripts/
│       ├── demo-mini-http-server.js
│       ├── demo-websocket.js
│       └── demo-http2.js
└── sharing/
    └── slides.md
```

---

## 学习资源

- [HTTP/1.1 RFC 7230-7235](https://tools.ietf.org/html/rfc7230)
- [HTTP/2 RFC 7540](https://tools.ietf.org/html/rfc7540)
- [WebSocket RFC 6455](https://tools.ietf.org/html/rfc6455)
- [Node.js http 模块文档](https://nodejs.org/api/http.html)
- [High Performance Browser Networking (Grigorik)](https://hpbn.co/)
