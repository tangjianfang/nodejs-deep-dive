# 生产就绪检查清单

> 覆盖 12 个月所学内容的完整 Production Readiness Checklist。
> 每项对应一个可验证的行动，而非模糊的"最佳实践"。

---

## 模块 1 — V8 与运行time（Month 01）

- [ ] 避免在热路径中混用不同类型（破坏 Hidden Class 优化）
- [ ] 性能敏感函数用 `console.time()` / `performance.mark()` 实测
- [ ] 了解 `--max-old-space-size`，根据服务器内存配置（默认 1.5GB）
- [ ] 避免在循环中使用 `delete obj.prop`（触发 Deoptimization）
- [ ] 使用 `node --prof` + `node --prof-process` 识别 CPU 热点

---

## 模块 2 — 异步编程（Month 02）

- [ ] 所有 async 函数的 Promise rejection 均有处理（`try/catch` 或 `.catch()`）
- [ ] 监听 `process.on('unhandledRejection', ...)` 防止静默失败
- [ ] 并发控制：批量操作使用 `p-limit` 或自实现的 `ConcurrentLimiter` 限制并发数
- [ ] `Promise.all` vs `Promise.allSettled` 选择正确（前者一个失败全失败）
- [ ] AsyncLocalStorage 用于请求级别的 context 传递（如 traceId、userId）

---

## 模块 3 — Stream 与 Buffer（Month 03）

- [ ] 大文件处理使用 Stream（而非 `fs.readFileSync`）
- [ ] 使用 `stream.pipeline()` 而非 `pipe()`（自动错误传播和清理）
- [ ] Transform Stream 的 `_transform` 方法始终调用 `callback()`
- [ ] backpressure：writable.write() 返回 false 时暂停 readable
- [ ] Buffer 操作使用 `Buffer.alloc()` 而非 `new Buffer()`（已弃用）

---

## 模块 4 — HTTP 与网络（Month 04）

- [ ] HTTP 服务器配置合理的 `keepAliveTimeout`（默认 5s，建议 >= 65s 在负载均衡后）
- [ ] 设置 `headersTimeout` 防止慢速客户端攻击
- [ ] HTTP/2 场景使用多路复用，减少连接数
- [ ] 正确设置 `Content-Type`、`Content-Length` 响应头
- [ ] 大请求体限制（如 express: `bodyParser.json({ limit: '1mb' })`）

---

## 模块 5 — Express/Koa（Month 05）

- [ ] 全局错误中间件（Express: `app.use((err, req, res, next) => {})`）
- [ ] 不向客户端暴露错误堆栈（`NODE_ENV=production` 时隐藏 stack）
- [ ] 请求参数校验（`zod` / `joi` / `ajv`）
- [ ] 响应头安全配置（`helmet` middleware）
- [ ] 路由日志记录请求方法+路径+状态码+耗时

---

## 模块 6 — 数据库（Month 06）

- [ ] 数据库连接使用连接池，配置合理的 `max`/`min`/`idleTimeoutMillis`
- [ ] N+1 问题已通过 DataLoader / JOIN 解决
- [ ] 慢查询日志已开启，P99 查询耗时 < 100ms
- [ ] 事务中的操作都有错误回滚处理
- [ ] Redis 分布式锁有 TTL 防止死锁

---

## 模块 7 — 认证与安全（Month 07）

- [ ] JWT 使用 RS256（非对称），私钥不存在应用服务器
- [ ] JWT `exp` 字段已设置（Access Token 15分钟，Refresh Token 7天）
- [ ] 密码使用 `scrypt` / `bcrypt` 存储（禁止 MD5/SHA1 明文）
- [ ] OAuth2 使用 PKCE（Authorization Code Flow）
- [ ] 所有 HTTP 端点强制 HTTPS（Ingress 层 TLS 终止）
- [ ] SQL/NoSQL 查询使用参数化查询，防止注入
- [ ] 输入校验在服务端始终执行（不依赖前端校验）
- [ ] `crypto.timingSafeEqual()` 用于 token 比较（防时序攻击）

---

## 模块 8 — 测试与调试（Month 08）

- [ ] 单元测试覆盖率 > 80%（关键业务逻辑 > 95%）
- [ ] 集成测试覆盖主要 API 路径
- [ ] CI 流程包含 lint + test + build
- [ ] 内存泄漏检测（定期 `process.memoryUsage()` 监控）
- [ ] 用 `--inspect` 调试生产问题时，绑定到 `127.0.0.1`（非 0.0.0.0）

---

## 模块 9 — 性能优化（Month 09）

- [ ] CPU 密集型任务使用 Worker Threads（不阻塞主线程）
- [ ] 热点数据有 LRU 缓存，设置 TTL 防止旧数据
- [ ] 缓存防穿透：空结果也缓存（短 TTL）
- [ ] 缓存防雪崩：TTL 加随机 jitter
- [ ] Prometheus 指标已接入：`http_requests_total`、`http_request_duration_seconds`

---

## 模块 10 — 微服务（Month 10）

- [ ] 对所有外部依赖（DB、第三方 API）配置 Circuit Breaker
- [ ] 长事务使用 Saga Pattern，每步都有补偿操作
- [ ] 消息消费幂等（用唯一 messageId 去重）
- [ ] gRPC 接口有 deadline/timeout 设置
- [ ] 服务间调用记录 traceId（分布式追踪）

---

## 模块 11 — DevOps（Month 11）

- [ ] Docker 镜像使用非 root 用户运行
- [ ] 镜像已通过 `trivy` 或 `docker scout` 扫描漏洞
- [ ] K8s Deployment 配置了 liveness + readiness probe
- [ ] 设置 CPU/Memory requests 和 limits
- [ ] 实现 SIGTERM 优雅关闭（terminationGracePeriodSeconds ≥ 60）
- [ ] `preStop` lifecycle hook sleep 几秒（等 kube-proxy 更新）
- [ ] HPA 配置防止流量突增时服务不可用
- [ ] 至少 2 副本（或配置 PodDisruptionBudget）
- [ ] Secrets 通过 K8s Secret 注入，不存在镜像或 ConfigMap

---

## 模块 12 — 综合（Month 12）

- [ ] 关键架构决策已记录为 ADR
- [ ] API 有版本控制（`/v1/users`）
- [ ] 完整的 README（运行方式、环境变量、部署步骤）
- [ ] 错误有统一的 JSON 响应格式 `{ code, message, requestId }`
- [ ] 日志结构化（JSON 格式，含 `level`、`timestamp`、`traceId`）
- [ ] 已设置合理的限流（防止 DDoS 和误操作）
- [ ] Runbook 文档（常见故障处理步骤）

---

## 快速评估表

对自己的项目打分（0=未做，1=部分，2=完成）：

| 类别         | 满分 | 你的分 |
| ------------ | ---- | ------ |
| 异步安全性   | 10   |        |
| 安全认证     | 16   |        |
| 测试覆盖     | 8    |        |
| 性能监控     | 8    |        |
| 容器化部署   | 18   |        |
| 可观察性     | 8    |        |
| **总计**     | 68   |        |

**评分标准：**
- 60+ 生产就绪 ✅
- 40-59 需要改进 ⚠️
- < 40 存在重大风险 ❌
