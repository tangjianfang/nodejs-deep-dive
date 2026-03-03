# 系统设计基础

## 1. 系统设计流程（4 步法）

```
Step 1: 需求澄清（5 分钟）
  └─ 功能需求：核心特性是什么？
  └─ 非功能需求：QPS / 延迟 / 可用性 / 一致性
  └─ 规模估算：DAU / 数据量 / 读写比

Step 2: 概要设计（10 分钟）
  └─ 画高层架构图
  └─ 选择核心技术栈
  └─ 定义 API 接口

Step 3: 深入设计（20 分钟）
  └─ 数据模型 + 存储方案
  └─ 核心流程详细拆解
  └─ 处理瓶颈和边界情况

Step 4: 总结 + 扩展（5 分钟）
  └─ 单点故障
  └─ 扩缩容策略
  └─ 监控指标
```

---

## 2. 容量估算（Back-of-the-envelope）

**常用数字记忆：**

| 单位        | 大小      | 示例                  |
| ----------- | --------- | --------------------- |
| 1 char      | 1 Byte    | ASCII 字Symbol        |
| 1 中文字    | 3 Bytes   | UTF-8 编码            |
| 1 UUID      | 36 Bytes  | 唯一标识              |
| 1 ID (int64)| 8 Bytes   | 雪花 ID               |
| 1 用户行    | ~100 Bytes| id+name+email+ts      |
| 1 推文      | ~300 Bytes| id+userId+text+ts     |
| 1 图片缩略图| ~200 KB   | 压缩后                |
| 1 图片原图  | ~3 MB     | 手机拍摄              |
| 1 分钟视频  | ~10 MB    | 720p 压缩             |

**延迟数字：**

```
L1 缓存访问:     0.5 ns
内存访问:        100 ns
SSD 随机读:      100 μs
网络同机房往返:   0.5 ms
跨城 RTT:        30 ms
跨国 RTT:        150 ms
```

**Twitter 规模估算示例：**

```
日活用户 (DAU):  3 亿
发推频率:        每用户每天 0.1 条
─────────────────────────────────
写 QPS = 3亿 × 0.1 / 86400 ≈ 350 QPS

读写比: 100:1
读 QPS = 350 × 100 ≈ 35,000 QPS

存储:
每条推文 300B × 350 条/秒 × 86400 × 365
= ≈ 3.3 TB / 年
```

---

## 3. Twitter 时间线设计（经典案例）

### 3.1 核心功能

```
POST /tweet        发布推文
GET  /timeline     获取首页时间线（关注者的推文）
GET  /user/:id/tweets  用户时间线
```

### 3.2 两种时间线生成方案

**方案 A: Fan-out on Write（写扩散）**

```
用户 A 发推文
    │
    ▼
将推文 ID 写入 A 的所有粉丝的 Timeline Cache

┌────────────────────────────────────────┐
│ Redis: timeline:{userId} = [tweetIds] │  ← 维护每人的收件箱
└────────────────────────────────────────┘

优点: 读时间线极快 O(1)
缺点: 大 V（1000 万粉丝）发一条推文要写 1000 万次
```

**方案 B: Fan-out on Read（读扩散）**

```
用户请求时间线
    │
    ▼
查询关注列表 → 合并各人的最新推文 → 排序

优点: 写操作简单
缺点: 热门用户关注 2000 人，读时需 2000 次查询
```

**Twitter 实际方案: 混合策略**

```
普通用户（< 100万粉丝）:  Fan-out on Write
大 V（> 100万粉丝）:      Fan-out on Read
                           └─ 读取时单独获取大 V 的最新推文，合并
```

### 3.3 数据模型

```sql
-- 推文表（分片: tweet_id % 1024）
CREATE TABLE tweets (
  id        BIGINT PRIMARY KEY,   -- 雪花 ID（含时间戳）
  user_id   BIGINT NOT NULL,
  content   VARCHAR(280),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 关注关系表（分片: follower_id % 512）
CREATE TABLE follows (
  follower_id  BIGINT,
  followee_id  BIGINT,
  PRIMARY KEY (follower_id, followee_id)
);
```

```
Redis 存储:
  timeline:{userId}  → List (最新 800 条 tweetId)
  tweet:{tweetId}    → Hash (tweet 详情，热点缓存)
  user:{userId}      → Hash (用户信息缓存)
```

---

## 4. CAP 定理与实践

```
        C (一致性)
       / \
      /   \
     /  无法 \
    /   三同时 \
   /     满足  \
  A ─────────── P
(可用性)     (分区容忍)

P 在分布式系统中是必须的
所以实际选择是: CP 或 AP
```

| 系统      | 选择 | 场景               |
| --------- | ---- | ------------------ |
| ZooKeeper | CP   | 配置中心、选主     |
| Cassandra | AP   | 时间线、日志       |
| MySQL     | CP   | 交易、账户余额     |
| Redis     | AP   | 缓存（有副本延迟） |
| etcd      | CP   | K8s 控制面         |

**BASE vs ACID:**

```
ACID (传统关系型数据库):
  Atomicity    原子性
  Consistency  一致性
  Isolation    隔离性
  Durability   持久性

BASE (分布式系统):
  Basically Available  基本可用
  Soft State           软状态（允许临时不一致）
  Eventually Consistent 最终一致性
```

---

## 5. 常见面试题模板

| 系统           | 核心难点                     | 关键技术                        |
| -------------- | ---------------------------- | ------------------------------- |
| URL 短链       | 全局唯一 ID、高读 QPS         | 雪花 ID、Redis 缓存、CDN        |
| 限流系统       | 分布式计数、算法选择          | Redis + Lua、令牌桶/滑动窗口    |
| 消息队列       | 消息持久化、至少一次          | 预写日志(WAL)、消费者 ACK       |
| 搜索系统       | 倒排索引、分词                | Elasticsearch、TF-IDF           |
| 通知系统       | 百万推送、多渠道              | 消息队列 + 优先级 + 幂等        |
| 分布式文件系统 | 大文件分块、副本              | 分块存储、一致性哈希            |

---

## 练习清单

- [ ] 能在 5 分钟内完成 Twitter 时间线的容量估算
- [ ] 能解释 Fan-out on Write vs Read 的取舍
- [ ] 理解 CAP 定理并能举 3 个真实系统例子
- [ ] 设计一个简单的 URL 短链系统（包含 DB 表结构）
- [ ] 背诵常用延迟数字（L1/内存/SSD/网络）
