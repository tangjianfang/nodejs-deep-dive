# CI/CD 流水线设计

## 1. CI/CD 核心概念

```
CI（持续集成）:
  → 代码提交触发: 构建 → 测试 → 扫描
  → 目标: 尽早发现问题

CD（持续部署/交付）:
  → CI 通过后: 构建镜像 → 推送 → 部署
  → 持续交付: 自动部署到 staging，手动确认 production
  → 持续部署: 全自动部署到 production
```

---

## 2. GitHub Actions 示例

```yaml
# .github/workflows/ci-cd.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_PASSWORD: test
          POSTGRES_DB: testdb
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm test -- --coverage
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/testdb
      - uses: codecov/codecov-action@v3

  build-and-push:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          push: true
          tags: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to K8s
        env:
          KUBECONFIG: ${{ secrets.KUBECONFIG }}
        run: |
          kubectl set image deployment/myapp \
            myapp=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}
          kubectl rollout status deployment/myapp
```

---

## 3. 流水线最佳实践

```
分层策略:
  PR 流水线: lint + unit test（<2分钟）
  main 流水线: 完整测试 + 构建 + 部署 staging
  tag 流水线: 构建 + 部署 production

密钥管理:
  - 使用 GitHub Secrets 存储敏感信息
  - 不同环境使用不同密钥
  - 定期轮转

回滚策略:
  kubectl rollout undo deployment/myapp
  或: 重新触发上一个成功版本的 deploy 流水线
```

---

## 4. 实践 Checklist

- [ ] 为项目创建 GitHub Actions 工作流（lint + test + build）
- [ ] 配置 Docker 镜像推送到 GHCR
- [ ] 实现 K8s 滚动更新和回滚
- [ ] 设置 Environment Protection Rules（生产环境需审批）
