/**
 * demo-bullmq.js
 * 演示 BullMQ 任务队列的核心功能
 * 无需真实 Redis：使用内存模拟 BullMQ 行为
 *
 * 如需使用真实 BullMQ：
 *   npm install bullmq ioredis
 *   替换 MockQueue/MockWorker 为真实 Queue/Worker 即可
 */

'use strict';

const { EventEmitter } = require('events');

// ─── 内存版 BullMQ 模拟 ────────────────────────────────────────────────────────

let jobIdCounter = 0;

class MockJob {
  constructor(name, data, opts = {}) {
    this.id = String(++jobIdCounter);
    this.name = name;
    this.data = data;
    this.opts = opts;
    this.attemptsMade = 0;
    this.progress = 0;
    this.returnvalue = null;
    this.status = 'waiting';
    this._resolve = null;
    this._reject = null;
  }

  async updateProgress(value) {
    this.progress = value;
    this._emitter?.emit('progress', { jobId: this.id, data: value });
  }
}

class MockQueue extends EventEmitter {
  constructor(name, opts = {}) {
    super();
    this.name = name;
    this.opts = opts;
    this._waiting = [];
    this._delayed = [];
    this._workerCallbacks = [];
  }

  async add(name, data, opts = {}) {
    const job = new MockJob(name, data, opts);
    const delay = opts.delay || 0;

    if (delay > 0) {
      job.status = 'delayed';
      setTimeout(() => {
        job.status = 'waiting';
        this._waiting.push(job);
        this._tryDispatch();
      }, delay);
      console.log(`[Queue:${this.name}] Added delayed job #${job.id} "${name}" (delay:${delay}ms)`);
    } else {
      this._waiting.push(job);
      console.log(`[Queue:${this.name}] Added job #${job.id} "${name}"`);
      setImmediate(() => this._tryDispatch());
    }

    return job;
  }

  _tryDispatch() {
    if (this._waiting.length > 0 && this._workerCallbacks.length > 0) {
      const job = this._waiting.shift();
      const callback = this._workerCallbacks[0];
      callback(job);
    }
  }

  _registerWorker(callback) {
    this._workerCallbacks.push(callback);
  }
}

class MockWorker extends EventEmitter {
  constructor(queueName, processor, opts = {}) {
    super();
    this.queueName = queueName;
    this.processor = processor;
    this.opts = opts;
    this._concurrency = opts.concurrency || 1;
    this._active = 0;
    this._queue = null;
    this._paused = false;
    this._closing = false;
    this._activeJobs = new Set();
  }

  _attach(queue) {
    this._queue = queue;
    queue._registerWorker((job) => this._processJob(job));
  }

  async _processJob(job) {
    if (this._paused || this._closing) {
      this._queue._waiting.unshift(job); // 放回队列
      return;
    }

    if (this._active >= this._concurrency) {
      this._queue._waiting.unshift(job); // 超过并发限制，放回
      return;
    }

    this._active++;
    this._activeJobs.add(job);
    job.status = 'active';
    job._emitter = this;
    this.emit('active', job);

    const maxAttempts = job.opts.attempts || 1;

    const attempt = async () => {
      job.attemptsMade++;
      try {
        job.returnvalue = await this.processor(job);
        job.status = 'completed';
        this.emit('completed', job, job.returnvalue);
      } catch (err) {
        if (job.attemptsMade < maxAttempts) {
          const backoff = job.opts.backoff;
          let delay = 1000;
          if (backoff?.type === 'exponential') {
            delay = (backoff.delay || 1000) * Math.pow(2, job.attemptsMade - 1);
          } else if (backoff?.type === 'fixed') {
            delay = backoff.delay || 1000;
          }
          console.log(
            `  [Worker] Job #${job.id} failed (attempt ${job.attemptsMade}/${maxAttempts}), retry in ${delay}ms`
          );
          job.status = 'waiting';
          setTimeout(() => attempt(), delay);
          return;
        }
        job.status = 'failed';
        this.emit('failed', job, err);
      } finally {
        if (job.status === 'completed' || job.status === 'failed') {
          this._active--;
          this._activeJobs.delete(job);
          // 尝试处理队列中的下一个 job
          setImmediate(() => {
            const next = this._queue._waiting.shift();
            if (next) this._processJob(next);
          });
        }
      }
    };

    await attempt();
  }

  async pause() {
    this._paused = true;
    console.log(`[Worker:${this.queueName}] Paused`);
  }

  async resume() {
    this._paused = false;
    console.log(`[Worker:${this.queueName}] Resumed`);
    const next = this._queue._waiting.shift();
    if (next) this._processJob(next);
  }

  async close(force = false) {
    this._closing = true;
    if (!force && this._activeJobs.size > 0) {
      console.log(`[Worker:${this.queueName}] Waiting for ${this._activeJobs.size} active jobs to finish...`);
      await new Promise(resolve => {
        const check = () => {
          if (this._activeJobs.size === 0) resolve();
          else setTimeout(check, 100);
        };
        check();
      });
    }
    console.log(`[Worker:${this.queueName}] Closed`);
  }
}

function createQueue(name) {
  const queue = new MockQueue(name);
  return queue;
}

function createWorker(name, processor, opts = {}) {
  // find or create queue — in real BullMQ, Queue and Worker connect via Redis
  return (queue) => {
    const worker = new MockWorker(name, processor, opts);
    worker._attach(queue);
    return worker;
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Demo 1：基本任务处理 ──────────────────────────────────────────────────────

async function demoBasicQueue() {
  console.log('\n========================================');
  console.log('Demo 1: 基本任务队列');
  console.log('========================================');

  const emailQueue = createQueue('emails');

  const workerFactory = createWorker('emails', async (job) => {
    console.log(`  处理邮件任务 #${job.id}: 发送给 ${job.data.to}`);
    await sleep(100);
    await job.updateProgress(50);
    await sleep(100);
    await job.updateProgress(100);
    return { sent: true, messageId: `msg-${job.id}` };
  });

  const worker = workerFactory(emailQueue);

  worker.on('completed', (job, result) => {
    console.log(`  ✅ Job #${job.id} 完成:`, result);
  });

  worker.on('failed', (job, err) => {
    console.error(`  ❌ Job #${job.id} 失败:`, err.message);
  });

  await emailQueue.add('send-welcome', { to: 'alice@example.com', subject: 'Welcome!' });
  await emailQueue.add('send-welcome', { to: 'bob@example.com',   subject: 'Welcome!' });
  await emailQueue.add('send-welcome', { to: 'carol@example.com', subject: 'Welcome!' });

  await sleep(800);
}

// ─── Demo 2：重试与退避 ────────────────────────────────────────────────────────

async function demoRetry() {
  console.log('\n========================================');
  console.log('Demo 2: 重试与指数退避');
  console.log('========================================');

  const queue = createQueue('retry-demo');
  let callCount = 0;

  const workerFactory = createWorker('retry-demo', async (job) => {
    callCount++;
    console.log(`  处理 job #${job.id}，第 ${job.attemptsMade} 次尝试`);
    if (callCount < 3) {
      throw new Error('Temporary error (模拟临时故障)');
    }
    return { success: true, totalAttempts: job.attemptsMade };
  });

  const worker = workerFactory(queue);

  worker.on('completed', (job, result) => {
    console.log(`  ✅ Job #${job.id} 最终成功:`, result);
  });

  worker.on('failed', (job, err) => {
    console.error(`  ❌ Job #${job.id} 彻底失败:`, err.message);
  });

  await queue.add('flaky-task', { payload: 'test' }, {
    attempts: 5,
    backoff: { type: 'fixed', delay: 200 },
  });

  await sleep(2000);
}

// ─── Demo 3：并发控制 ──────────────────────────────────────────────────────────

async function demoConcurrency() {
  console.log('\n========================================');
  console.log('Demo 3: 并发控制 (concurrency: 2)');
  console.log('========================================');

  const queue = createQueue('concurrent');
  let activeCount = 0;
  let maxActive = 0;

  const workerFactory = createWorker('concurrent', async (job) => {
    activeCount++;
    maxActive = Math.max(maxActive, activeCount);
    console.log(`  Job #${job.id} 开始 (当前并发: ${activeCount})`);
    await sleep(200);
    activeCount--;
    console.log(`  Job #${job.id} 完成 (当前并发: ${activeCount})`);
    return true;
  }, { concurrency: 2 });

  const worker = workerFactory(queue);

  for (let i = 1; i <= 6; i++) {
    await queue.add(`task-${i}`, { index: i });
  }

  await sleep(800);
  console.log(`\n  最大同时活跃 job 数: ${maxActive} (应 ≤ 2)`);
}

// ─── Demo 4：延迟任务 ──────────────────────────────────────────────────────────

async function demoDelayedJob() {
  console.log('\n========================================');
  console.log('Demo 4: 延迟任务');
  console.log('========================================');

  const queue = createQueue('delayed-demo');
  const startTime = Date.now();

  const workerFactory = createWorker('delayed-demo', async (job) => {
    const elapsed = Date.now() - startTime;
    console.log(`  Job "${job.name}" 在 +${elapsed}ms 执行`);
    return true;
  });

  workerFactory(queue);

  await queue.add('immediate', { msg: '立即执行' });
  await queue.add('delayed-300', { msg: '300ms 后执行' }, { delay: 300 });
  await queue.add('delayed-600', { msg: '600ms 后执行' }, { delay: 600 });

  await sleep(900);
}

// ─── Demo 5：优雅关机 ──────────────────────────────────────────────────────────

async function demoGracefulShutdown() {
  console.log('\n========================================');
  console.log('Demo 5: 优雅关机');
  console.log('========================================');

  const queue = createQueue('shutdown-demo');

  const workerFactory = createWorker('shutdown-demo', async (job) => {
    console.log(`  Job #${job.id} 开始处理（耗时 500ms）`);
    await sleep(500);
    console.log(`  Job #${job.id} 处理完成`);
    return true;
  });

  const worker = workerFactory(queue);

  await queue.add('long-task-1', {});
  await queue.add('long-task-2', {});

  // 200ms 后触发关机
  await sleep(200);
  console.log('\n  收到 SIGTERM，开始优雅关机...');
  await worker.pause();           // 1. 停止接受新 job
  await worker.close(false);      // 2. 等待当前 job 完成
  console.log('  优雅关机完成 ✅');
}

// ─── 主程序 ────────────────────────────────────────────────────────────────────

async function main() {
  await demoBasicQueue();
  await demoRetry();
  await demoConcurrency();
  await demoDelayedJob();
  await demoGracefulShutdown();

  console.log('\n========================================');
  console.log('使用真实 BullMQ + Redis 的代码示例:');
  console.log('========================================');
  console.log(`
// npm install bullmq ioredis
const { Queue, Worker } = require('bullmq');
const IORedis = require('ioredis');
const connection = new IORedis({ host: 'localhost', port: 6379, maxRetriesPerRequest: null });

const queue = new Queue('emails', { connection });
const worker = new Worker('emails', async (job) => {
  // 处理 job
  return { done: true };
}, { connection, concurrency: 5 });

await queue.add('send-email', { to: 'user@example.com' });
`);
}

main().catch(console.error);
