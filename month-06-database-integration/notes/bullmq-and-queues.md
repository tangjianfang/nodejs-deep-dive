# BullMQ 与消息队列深度解析

## 1. 为什么需要消息队列？

```
同步处理（直接调用）:
  HTTP 请求 → 邮件服务 → 响应   ← 如果发邮件耗时 3s，用户等 3s！

异步处理（消息队列）:
  HTTP 请求 → 加入队列 → 立即响应（<100ms）
                ↓
          Worker 处理 → 发邮件
```

**适用场景：**
- 耗时操作异步化（邮件、短信、图片处理）
- 限制并发（控制对第三方 API 的调用速率）
- 重试失败任务（自动退避重试）
- 任务调度（cron job）
- 削峰填谷（流量突发时缓冲）

---

## 2. BullMQ 架构

```
生产者 (Producer)
  │ queue.add('send-email', { to: 'user@example.com' })
  ▼
Redis（存储 job 数据）
  ├── bull:emailQueue:waiting   ← 等待队列（List）
  ├── bull:emailQueue:active    ← 处理中（Hash）
  ├── bull:emailQueue:completed ← 已完成（ZSet，按完成时间）
  ├── bull:emailQueue:failed    ← 失败（ZSet）
  └── bull:emailQueue:delayed   ← 延迟队列（ZSet，按执行时间）
  ▼
消费者 (Worker)
  │ new Worker('emailQueue', async (job) => { ... })
  ▼
QueueEvents（事件监听）
  │ queueEvents.on('completed', (jobId) => { ... })
```

---

## 3. 安装与基本用法

```bash
npm install bullmq ioredis
```

```javascript
// npm install bullmq ioredis
const { Queue, Worker, QueueEvents, FlowProducer } = require('bullmq');
const IORedis = require('ioredis');

const connection = new IORedis({ host: 'localhost', port: 6379, maxRetriesPerRequest: null });

// ─── 生产者：创建 Queue 并添加任务 ────────────────────────────────────────────

const emailQueue = new Queue('emails', { connection });

// 立即执行
await emailQueue.add('send-welcome', {
  to: 'alice@example.com',
  subject: 'Welcome!',
  template: 'welcome',
});

// 延迟执行（5秒后）
await emailQueue.add('send-reminder', { to: 'bob@example.com' }, {
  delay: 5000,
});

// 定时执行（cron）
await emailQueue.add('daily-report', {}, {
  repeat: { pattern: '0 9 * * *' }, // 每天 9:00
});

// 优先级（0最低，数字越大优先级越高）
await emailQueue.add('urgent-alert', { message: 'Server down!' }, { 
  priority: 10
});

// 批量添加
await emailQueue.addBulk([
  { name: 'email-1', data: { to: 'user1@example.com' } },
  { name: 'email-2', data: { to: 'user2@example.com' } },
]);
```

---

## 4. Job 生命周期

```
waiting → [Worker 取出] → active → [成功] → completed
                          active → [失败] → (重试?: waiting/delayed) → failed
                          active → [手动] → delayed

Job 状态转换:
  add()     → waiting（放入等待队列）
  Worker    → active（开始处理）
  成功返回   → completed（放入完成集合）
  抛出异常   → failed（如果重试耗尽） 或 waiting（等待重试）
  延迟任务   → delayed → [到期] → waiting
```

---

## 5. Worker 配置

```javascript
const emailWorker = new Worker(
  'emails',
  async (job) => {
    // job.name: 'send-welcome'
    // job.data: { to: 'alice@...', subject: '...' }
    // job.id: 唯一 ID
    // job.attemptsMade: 已尝试次数
    
    console.log(`Processing job ${job.id}: ${job.name}`);
    
    // 更新进度
    await job.updateProgress(10);
    
    // 执行实际工作
    await sendEmail(job.data);
    
    await job.updateProgress(100);
    
    // 返回值会保存到 job.returnvalue
    return { sent: true, timestamp: new Date().toISOString() };
  },
  {
    connection,
    concurrency: 5,           // 最多同时处理 5 个 job
    limiter: {                // 限流：每秒最多 10 个
      max: 10,
      duration: 1000,
    },
    stalledInterval: 30000,   // 检测僵尸 job 间隔
    maxStalledCount: 2,       // 最多标记为僵尸 2 次，然后失败
  }
);

// Worker 事件
emailWorker.on('completed', (job, result) => {
  console.log(`Job ${job.id} completed:`, result);
});

emailWorker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message);
});

emailWorker.on('progress', (job, progress) => {
  console.log(`Job ${job.id} progress: ${progress}%`);
});
```

---

## 6. 重试与退避策略

```javascript
await emailQueue.add('send-email', { to: 'user@example.com' }, {
  attempts: 5,                  // 最大重试 5 次
  backoff: {
    type: 'exponential',        // 指数退避
    delay: 1000,                // 初始延迟 1s，之后 2s, 4s, 8s, 16s
  },
  // 或者固定间隔
  backoff: {
    type: 'fixed',
    delay: 5000,                // 每次重试间隔 5s
  },
  removeOnComplete: { count: 100 }, // 只保留最近 100 个完成的 job
  removeOnFail: { age: 7 * 24 * 3600 }, // 保留失败 job 7 天
});

// 在 Worker 中区分是否应该重试
async function processJob(job) {
  try {
    await callExternalAPI(job.data);
  } catch (err) {
    if (err.code === 'RATE_LIMIT') {
      // 延迟重试（告诉 BullMQ 何时重试）
      throw new Error('Rate limited');
    }
    if (err.code === 'INVALID_EMAIL') {
      // 不应该重试，直接失败
      await job.discard(); // 立即标记为失败，不再重试
      throw err;
    }
    throw err; // 其他错误：按策略重试
  }
}
```

---

## 7. QueueEvents（事件监听）

```javascript
const queueEvents = new QueueEvents('emails', { connection });

queueEvents.on('waiting', ({ jobId }) => {
  console.log(`Job ${jobId} waiting`);
});

queueEvents.on('active', ({ jobId, prev }) => {
  console.log(`Job ${jobId} is now active`);
});

queueEvents.on('completed', ({ jobId, returnvalue }) => {
  console.log(`Job ${jobId} completed:`, returnvalue);
});

queueEvents.on('failed', ({ jobId, failedReason }) => {
  console.error(`Job ${jobId} failed: ${failedReason}`);
});

queueEvents.on('progress', ({ jobId, data }) => {
  console.log(`Job ${jobId} progress: ${data}%`);
});

// 等待特定 job 完成（对 API 响应很有用）
const job = await emailQueue.add('send-verification', { userId: 123 });
const result = await job.waitUntilFinished(queueEvents, 30000); // 最多等 30s
console.log('Result:', result);
```

---

## 8. 优雅关机

```javascript
async function gracefulShutdown() {
  console.log('Shutting down BullMQ worker...');
  
  // 1. 停止接受新 job
  await emailWorker.pause();
  
  // 2. 等待当前 job 完成（最多 30 秒）
  await emailWorker.close(false); // false = 等待进行中的 job
  // 或强制关闭: await emailWorker.close(true);
  
  // 3. 关闭连接
  await connection.quit();
  
  console.log('Worker shutdown complete');
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
```

---

## 9. 练习 Checklist

- [ ] 启动 Redis，运行一个简单的 BullMQ demo（add job → Worker 处理）
- [ ] 实现指数退避重试（模拟 3 次失败后成功）
- [ ] 实现并发限制（concurrency: 3，观察 job 处理顺序）
- [ ] 使用 QueueEvents 监听所有事件，打印完整的 job 生命周期
- [ ] 实现优雅关机（等待 active job 完成后再退出）
