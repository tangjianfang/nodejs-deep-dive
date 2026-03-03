# 从代码到生产 — Docker + K8s + GitHub Actions 全流程实战

**月度技术分享 · Month 11**

---

## Slide 1 — 为什么"能跑"不等于"能上线"

```
开发环境                     生产环境
─────────────────────        ─────────────────────────────────
本地 node server.js    →??→  负载均衡 → 多实例 → 滚动更新
"我这里没问题"                 版本回滚 / 故障自愈 / 零停机
```

**Production 额外要求：**

| 问题                | 解决方案           |
| ------------------- | ------------------ |
| 环境不一致          | Docker 容器化      |
| 手工部署容易出错    | CI/CD 自动化       |
| 服务崩了没人知道    | 健康检查 + 监控    |
| 流量突增撑不住      | K8s 水平扩缩容 HPA |
| 部署中服务中断      | 滚动更新 + 优雅关闭|

🗣️ **主讲思路**: 引入点 — "我们花了 11 个月学代码，今天学怎么把代码真正交付给用户"

---

## Slide 2 — Docker 多阶段构建

```dockerfile
# ❌ 单阶段：最终镜像包含 devDependencies + 编译工具
FROM node:20
COPY . .
RUN npm install && npm run build
CMD ["node", "dist/index.js"]
# 镜像大小: ~600MB

# ✅ 多阶段：精简最终镜像
FROM node:20-alpine AS builder
RUN npm ci                      # 全量安装
RUN npm run build               # 编译
RUN npm prune --omit=dev        # 删除 devDeps

FROM node:20-alpine AS runtime
USER node                       # 非 root！
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
CMD ["node", "dist/index.js"]
# 镜像大小: ~80MB  减少 87%
```

**安全清单：**
- [ ] 非 root 用户运行（`USER node`）
- [ ] 使用 `dumb-init` 处理 PID 1 信号
- [ ] `npm ci` 而非 `npm install`（可复现构建）
- [ ] `trivy image` 扫描 CVE 漏洞

🗣️ **主讲思路**: 对比镜像大小的实际影响（拉取时间 / 攻击面 / 存储费用）

---

## Slide 3 — Kubernetes 核心对象速查

```
┌──────────────────────────────────────────────────────┐
│  Deployment  ── 声明"我要 3 个 Pod"                   │
│    │                                                  │
│    ▼                                                  │
│  Pod ×3  ── 实际运行容器的最小单元                    │
│    │                                                  │
│    ▼                                                  │
│  Service  ── 稳定的虚拟 IP（即使 Pod IP 变了）        │
│    │                                                  │
│    ▼                                                  │
│  Ingress  ── 对外暴露 HTTP/HTTPS，绑定域名            │
└──────────────────────────────────────────────────────┘
```

**关键配置片段：**

```yaml
# 滚动更新策略
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxUnavailable: 0   # 始终保持 minReadySeconds 可用
    maxSurge: 1         # 最多多启动 1 个 Pod

# 资源限制（必须设！否则一个 Pod 吃光所有内存）
resources:
  requests: { cpu: "100m", memory: "128Mi" }
  limits:   { cpu: "500m", memory: "512Mi" }
```

🗣️ **主讲思路**: 强调 `requests` vs `limits` — requests 用于调度决策，limits 防止 OOM

💻 **Live Demo**: `kubectl get pods -w` 观察滚动更新过程

---

## Slide 4 — Liveness vs Readiness vs Startup Probe

```
┌──────────────────────────────────────────────────────────┐
│  启动阶段           运行阶段                              │
│                                                          │
│  [startupProbe]  →  [livenessProbe]  (定期检查，失败则重启)│
│        │         →  [readinessProbe] (失败则从 Service    │
│     成功后开始                         的 Endpoints 摘除) │
└──────────────────────────────────────────────────────────┘
```

| Probe       | 失败后果      | 用于           |
| ----------- | ------------- | -------------- |
| liveness    | 重启 Pod      | 检测死锁/卡死  |
| readiness   | 摘除流量      | 检测依赖就绪   |
| startup     | 延迟其他 probe | 慢启动应用    |

```yaml
livenessProbe:
  httpGet: { path: /healthz, port: 3000 }
  initialDelaySeconds: 30   # 给应用启动时间
  periodSeconds: 10
  failureThreshold: 3        # 连续 3 次才重启

readinessProbe:
  httpGet: { path: /readyz, port: 3000 }
  periodSeconds: 5
  failureThreshold: 1        # 1 次失败就摘流量（保守）
```

🗣️ **主讲思路**: "/readyz 返回 503 不会重启 Pod，只是停止发送流量" — 这是最常见的混淆点

---

## Slide 5 — 优雅关闭（Graceful Shutdown）流程

```
K8s 执行滚动更新
      │
      ▼
  SIGTERM → Node.js 进程
      │
      ├─① server.close()       停止接受新连接
      │
      ├─② 等待现有请求完成     （最长 30s）
      │
      ├─③ 关闭 DB / Redis 连接
      │
      └─④ process.exit(0)      干净退出
```

```javascript
process.on('SIGTERM', async () => {
  server.close(async () => {
    await db.end();
    await redis.quit();
    process.exit(0);
  });
  // 兜底强制退出（防止卡住）
  setTimeout(() => process.exit(1), 30_000).unref();
});
```

**K8s 侧配置：**
```yaml
terminationGracePeriodSeconds: 60  # 给足时间（默认 30s）
lifecycle:
  preStop:
    exec:
      command: ["/bin/sleep", "5"]  # 等 Service 摘流量
```

🗣️ **主讲思路**: preStop sleep 5 秒是为了给 kube-proxy 更新 iptables 规则的时间，避免在 SIGTERM 前还有请求进来

---

## Slide 6 — GitHub Actions CI/CD 全流程

```
git push main
      │
      ▼
┌─────────────────────────────────────────────────────┐
│  CI Pipeline                                        │
│  lint → test → build → docker build → push GHCR    │
└─────────────────────────┬───────────────────────────┘
                          │ on: success
                          ▼
┌─────────────────────────────────────────────────────┐
│  CD Pipeline                                        │
│  kubectl set image → 等待 rollout → smoke test     │
│  失败 → kubectl rollout undo                        │
└─────────────────────────────────────────────────────┘
```

**最小安全配置：**
```yaml
permissions:
  contents: read         # 只读代码
  packages: write        # 推 GHCR
  id-token: write        # OIDC 无密码登录（代替 secrets）

env:
  IMAGE: ghcr.io/${{ github.repository }}:${{ github.sha }}
```

**回滚命令：**
```bash
# 查看历史版本
kubectl rollout history deployment/myapp

# 回滚上一个版本
kubectl rollout undo deployment/myapp

# 回滚到指定版本
kubectl rollout undo deployment/myapp --to-revision=3
```

🗣️ **主讲思路**: 强调 `github.sha` 打标签的好处 — 每个镜像都可追溯到对应的代码提交

💻 **Live Demo**: 打开 GitHub Actions 看一次真实运行的 workflow

---

## Slide 7 — 本月核心要点回顾

```
代码 → 容器 → 集群 → 流量
 │       │       │       │
 TS     Docker  K8s    Ingress
测试   多阶段  Probe   TLS
       非root  HPA    限速
```

**Production Checklist（部署前必查）：**

- [ ] 镜像使用非 root 用户
- [ ] 配置 liveness + readiness probe
- [ ] 设置 resource requests & limits
- [ ] 实现 SIGTERM 优雅关闭（terminationGracePeriodSeconds ≥ 60）
- [ ] 至少 2 个副本（单副本 = 单点故障）
- [ ] CI/CD 包含自动回滚逻辑
- [ ] 敏感配置用 K8s Secret（不要写在镜像里！）

🗣️ **主讲思路**: "一个配置错误可能导致你在 3AM 被 oncall 叫醒" — 结尾呼应开头

❓ **互动问题**: "你们公司的 terminationGracePeriodSeconds 设置了多少？为什么？"
