# ─── 阶段 1: 构建阶段 ──────────────────────────────────────────────────────────
# 使用完整 Node.js 镜像安装依赖并构建
FROM node:20-alpine AS builder

# 安装构建工具（需要编译原生模块时使用）
RUN apk add --no-cache python3 make g++

WORKDIR /app

# 先复制依赖文件，利用 Docker 层缓存
# 只有 package.json 变化时才重新 npm install
COPY package*.json ./

# 安装全部依赖（包括 devDependencies，用于构建/测试）
RUN npm ci --ignore-scripts

# 复制源码
COPY . .

# 运行 TypeScript 编译（如果使用 TS）
# RUN npm run build

# 运行测试（CI 中验证）
# RUN npm test -- --passWithNoTests

# 只保留生产依赖
RUN npm prune --production

# ─── 阶段 2: 运行阶段 ──────────────────────────────────────────────────────────
# 最小化镜像，只包含运行时所需
FROM node:20-alpine AS runtime

# 安全标签
LABEL maintainer="nodejs-deep-dive"
LABEL version="1.0.0"

# 安装运行时依赖（如 dumb-init 正确处理 PID 1 信号）
RUN apk add --no-cache dumb-init

# 设置工作目录
WORKDIR /app

# 非 root 用户运行（安全最佳实践）
# node:alpine 镜像已内置 node 用户（uid=1000）
RUN chown -R node:node /app
USER node

# 从构建阶段复制必要文件
# 先复制 node_modules（仅生产依赖）
COPY --from=builder --chown=node:node /app/node_modules ./node_modules

# 复制应用代码
COPY --from=builder --chown=node:node /app/src ./src
# 如有编译产物：
# COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/package.json ./

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3000

# 暴露端口
EXPOSE 3000

# 健康检查（K8s 也会配置 probe，这是 docker-compose 级别的检查）
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# 使用 dumb-init 作为 PID 1 进程管理器
# 正确转发 SIGTERM 信号给 Node.js 进程（支持优雅关闭）
ENTRYPOINT ["dumb-init", "--"]

# 启动命令
CMD ["node", "src/index.js"]

# ─── 开发阶段（可选）────────────────────────────────────────────────────────────
FROM runtime AS development

# 切回 root 安装 devDependencies
USER root
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
RUN npm install --only=dev
USER node

ENV NODE_ENV=development

CMD ["node", "--inspect=0.0.0.0:9229", "src/index.js"]

# ─── 使用说明 ──────────────────────────────────────────────────────────────────
# 构建生产镜像:
#   docker build --target runtime -t myapp:latest .
#
# 构建开发镜像:
#   docker build --target development -t myapp:dev .
#
# 查看镜像大小:
#   docker images myapp
#
# 扫描安全漏洞:
#   docker scout cves myapp:latest
#   trivy image myapp:latest
#
# 推送到 GHCR:
#   docker tag myapp:latest ghcr.io/OWNER/myapp:latest
#   docker push ghcr.io/OWNER/myapp:latest
#
# Docker Compose 示例 (docker-compose.yml):
#   services:
#     app:
#       build:
#         context: .
#         target: runtime
#       ports: ["3000:3000"]
#       environment:
#         - DATABASE_URL=postgresql://postgres:secret@db:5432/mydb
#         - REDIS_URL=redis://redis:6379
#       depends_on:
#         db:
#           condition: service_healthy
#         redis:
#           condition: service_healthy
