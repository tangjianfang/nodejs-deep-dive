# Docker 容器化深度解析

## 1. 为什么需要容器化？

```
"Works on my machine" 问题:
  开发环境: Node 18, Ubuntu, 依赖版本 X
  测试环境: Node 20, CentOS, 依赖版本 Y
  → 环境差异导致 Bug

Docker 解决方案:
  将应用 + 运行时 + 依赖打包成镜像
  任何地方运行都是一样的环境
```

---

## 2. 多阶段构建（Multi-stage Build）

```dockerfile
# Stage 1: 构建（包含所有开发依赖）
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci                    # 安装所有依赖（含 devDependencies）
COPY . .
RUN npm run build             # TypeScript 编译等
RUN npm prune --production    # 删除 devDependencies

# Stage 2: 运行（只包含生产所需）
FROM node:20-alpine AS runtime
WORKDIR /app

# 非 root 用户（安全最佳实践）
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/dist         ./dist
COPY --from=builder --chown=appuser:appgroup /app/package.json ./

EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', r => r.statusCode === 200 ? process.exit(0) : process.exit(1)).on('error', () => process.exit(1))"

CMD ["node", "dist/index.js"]
```

**多阶段构建优势**:
- 最终镜像只含运行时（无 devDeps、无源码）
- 镜像体积减少 50-70%

---

## 3. .dockerignore

```
node_modules/
.git/
.env*
*.log
coverage/
.nyc_output/
dist/       # 使用多阶段构建时，由 builder 阶段生成
README.md
Dockerfile
docker-compose*
.github/
tests/
```

---

## 4. Docker Compose（本地开发）

```yaml
# docker-compose.yml
version: '3.9'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/myapp
      - REDIS_URL=redis://redis:6379
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - .:/app           # 开发时绑定挂载（热重载）
      - /app/node_modules # 排除 node_modules

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: myapp
    ports: ["5432:5432"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
```

---

## 5. 镜像安全

```bash
# 扫描镜像漏洞
docker scout cves myapp:latest
# 或
trivy image myapp:latest

# 最小化攻击面
FROM node:20-alpine  # ← alpine 比 debian 小 ~80%

# 不以 root 运行
USER node

# 只开放必要端口
EXPOSE 3000
```

---

## 6. 实践 Checklist

- [ ] 编写多阶段 Dockerfile，验证最终镜像大小
- [ ] 配置 .dockerignore，排除不必要文件
- [ ] 用 docker-compose 启动完整开发环境（App + DB + Redis）
- [ ] 为应用添加 HEALTHCHECK 指令
- [ ] 扫描镜像安全漏洞（docker scout 或 trivy）
