# Kubernetes 基础

## 1. 核心概念

```
集群架构:
  Master Node (Control Plane)
    ├── API Server    ← 所有操作的入口
    ├── Scheduler     ← 决定 Pod 运行在哪个 Node
    ├── Controller    ← 维护期望状态
    └── etcd          ← 集群状态存储

  Worker Node
    ├── kubelet       ← 管理 Pod 生命周期
    ├── kube-proxy    ← 网络代理
    └── Container Runtime (containerd)
```

---

## 2. 核心资源

### Pod
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: myapp-pod
  labels:
    app: myapp
spec:
  containers:
    - name: myapp
      image: myapp:1.0.0
      ports:
        - containerPort: 3000
      resources:
        requests: { cpu: "100m", memory: "128Mi" }
        limits:   { cpu: "500m", memory: "512Mi" }
      livenessProbe:
        httpGet:    { path: /health, port: 3000 }
        initialDelaySeconds: 30
        periodSeconds: 10
      readinessProbe:
        httpGet:    { path: /ready, port: 3000 }
        initialDelaySeconds: 5
        periodSeconds: 5
```

### Deployment
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
spec:
  replicas: 3
  selector:
    matchLabels: { app: myapp }
  strategy:
    type: RollingUpdate
    rollingUpdate: { maxSurge: 1, maxUnavailable: 0 }  # 无停机更新
  template:
    metadata:
      labels: { app: myapp }
    spec:
      containers:
        - name: myapp
          image: myapp:1.0.0
```

### Service
```yaml
apiVersion: v1
kind: Service
metadata:
  name: myapp-svc
spec:
  selector: { app: myapp }
  ports:
    - port: 80
      targetPort: 3000
  type: ClusterIP    # 内部访问
  # type: LoadBalancer  # 外部访问（云环境）
```

---

## 3. ConfigMap & Secret

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: myapp-config
data:
  NODE_ENV: production
  LOG_LEVEL: info

---
apiVersion: v1
kind: Secret
metadata:
  name: myapp-secrets
type: Opaque
data:
  DATABASE_URL: <base64 encoded value>
  JWT_SECRET: <base64 encoded value>
```

```yaml
# 在 Deployment 中引用
envFrom:
  - configMapRef:
      name: myapp-config
  - secretRef:
      name: myapp-secrets
```

---

## 4. HPA（自动水平扩缩容）

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: myapp-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: myapp
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

---

## 5. 实践 Checklist

- [ ] 用 minikube 或 kind 搭建本地 K8s 集群
- [ ] 部署 Deployment + Service，验证滚动更新
- [ ] 配置 liveness/readiness probe，观察 Pod 健康检查
- [ ] 配置 HPA，用压测工具触发自动扩容
- [ ] 用 ConfigMap/Secret 管理配置，不在代码中硬编码
