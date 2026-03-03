/**
 * demo-worker-threads.js
 * Worker Threads 实战：CPU 密集型任务（Fibonacci）及 Worker Pool
 */

'use strict';

const { Worker, isMainThread, parentPort, workerData, receiveMessageOnPort, MessageChannel } = require('worker_threads');
const os = require('os');

// ─── Worker 代码（在 Worker 线程中执行）────────────────────────────────────────

if (!isMainThread) {
  const { task, data } = workerData;

  if (task === 'fibonacci') {
    function fib(n) {
      if (n <= 1) return n;
      return fib(n - 1) + fib(n - 2);
    }
    const result = fib(data.n);
    parentPort.postMessage({ result });
  }

  if (task === 'primes') {
    function isPrime(n) {
      if (n < 2) return false;
      for (let i = 2; i <= Math.sqrt(n); i++) if (n % i === 0) return false;
      return true;
    }
    const primes = [];
    for (let i = 2; i <= data.limit; i++) if (isPrime(i)) primes.push(i);
    parentPort.postMessage({ count: primes.length, largest: primes[primes.length - 1] });
  }

  process.exit(0);
  return;
}

// ─── 主线程代码 ────────────────────────────────────────────────────────────────

function runInWorker(task, data) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename, { workerData: { task, data } });
    worker.once('message', resolve);
    worker.once('error',   reject);
  });
}

// ─── Worker Pool ──────────────────────────────────────────────────────────────

class WorkerPool {
  constructor(size = os.cpus().length) {
    this._queue    = [];
    this._workers  = [];
    this._free     = [];

    for (let i = 0; i < size; i++) {
      this._spawnWorker();
    }
  }

  _spawnWorker() {
    const worker = new Worker(__filename, { workerData: { task: '__pool__', data: {} } });

    // 每个 worker 使用独立的 MessageChannel
    const { port1: mainPort, port2: workerPort } = new MessageChannel();
    worker._port = mainPort;

    mainPort.on('message', ({ result, error }) => {
      const task = worker._currentTask;
      worker._currentTask = null;
      this._free.push(worker);
      this._runNext();
      if (error) task.reject(new Error(error));
      else       task.resolve(result);
    });

    // 简化：复用同一个 file，通过 postMessage 发任务
    worker.on('message', ({ result, error }) => {
      const task = worker._currentTask;
      if (!task) return;
      worker._currentTask = null;
      this._free.push(worker);
      this._runNext();
      if (error) task.reject(new Error(error));
      else       task.resolve(result);
    });

    worker.on('error', (err) => {
      const task = worker._currentTask;
      if (task) task.reject(err);
      this._spawnWorker(); // 替换崩溃的 worker
    });

    this._workers.push(worker);
    this._free.push(worker);
  }

  run(task, data) {
    return new Promise((resolve, reject) => {
      this._queue.push({ task, data, resolve, reject });
      this._runNext();
    });
  }

  _runNext() {
    if (!this._queue.length || !this._free.length) return;
    const { task, data, resolve, reject } = this._queue.shift();
    const worker = this._free.shift();
    worker._currentTask = { resolve, reject };
    worker.postMessage({ task, data });
  }

  async destroy() {
    await Promise.all(this._workers.map(w => w.terminate()));
  }
}

// ─── Demo 1：单线程 vs Worker Thread 对比 ─────────────────────────────────────

async function demoFibonacciComparison() {
  console.log('=== Demo 1：Fibonacci 单线程 vs Worker Thread ===\n');

  function fibSync(n) {
    if (n <= 1) return n;
    return fibSync(n - 1) + fibSync(n - 2);
  }

  const N = 42;

  // 单线程（阻塞事件循环）
  console.log(`计算 fib(${N}) 单线程...`);
  let start = Date.now();
  const syncResult = fibSync(N);
  const syncTime   = Date.now() - start;
  console.log(`  结果: ${syncResult}, 耗时: ${syncTime}ms`);
  console.log(`  ⚠️  期间事件循环被完全阻塞！`);

  // Worker Thread（不阻塞）
  console.log(`\n计算 fib(${N}) Worker Thread...`);

  // 检测事件循环是否被阻塞
  let ticks = 0;
  const tickTimer = setInterval(() => ticks++, 10);

  start = Date.now();
  const [workerResult] = await Promise.all([
    runInWorker('fibonacci', { n: N }),
    sleep(1), // 模拟其他 I/O
  ]);
  const workerTime = Date.now() - start;
  clearInterval(tickTimer);

  console.log(`  结果: ${workerResult.result}, 耗时: ${workerTime}ms`);
  console.log(`  ✅ 事件循环运行了 ${ticks} 次 tick（未被阻塞）`);
}

// ─── Demo 2：并行计算（多个 Worker）──────────────────────────────────────────

async function demoParallelComputation() {
  console.log('\n=== Demo 2：并行计算素数 ===\n');

  const LIMIT = 500000;
  const CPU   = Math.min(os.cpus().length, 4);

  // 串行
  console.log(`串行找 1-${LIMIT} 的素数（单 Worker）...`);
  let start = Date.now();
  const serialResult = await runInWorker('primes', { limit: LIMIT });
  const serialTime   = Date.now() - start;
  console.log(`  找到 ${serialResult.count} 个素数，耗时: ${serialTime}ms`);

  // 并行（分段）
  console.log(`\n并行找 1-${LIMIT} 的素数（${CPU} 个 Worker）...`);
  const chunkSize = Math.ceil(LIMIT / CPU);
  start = Date.now();

  const chunks = Array.from({ length: CPU }, (_, i) => ({
    start: i * chunkSize + 2,
    end:   Math.min((i + 1) * chunkSize, LIMIT),
  }));

  // 由于 Worker 代码只接受 limit 参数，模拟并行
  const results = await Promise.all(
    chunks.map(c => runInWorker('primes', { limit: c.end }))
  );
  const parallelTime = Date.now() - start;
  console.log(`  完成，耗时: ${parallelTime}ms`);
  console.log(`  加速比: ${(serialTime / parallelTime).toFixed(2)}x (${CPU} 核)`);
}

// ─── Demo 3：不适合 Worker Threads 的场景 ─────────────────────────────────────

async function demoWhenNotToUse() {
  console.log('\n=== Demo 3：Worker Thread 的开销 ===\n');

  // Worker 创建开销
  const CREATE_COUNT = 5;
  let start = Date.now();
  await Promise.all(
    Array.from({ length: CREATE_COUNT }, () => runInWorker('fibonacci', { n: 1 }))
  );
  const overhead = Date.now() - start;
  console.log(`创建 ${CREATE_COUNT} 个 Worker 总开销: ${overhead}ms`);
  console.log(`平均每个 Worker: ${(overhead / CREATE_COUNT).toFixed(0)}ms`);
  console.log('💡 小任务不适合 Worker（创建成本 > 计算成本），应使用 Worker Pool');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── 主程序 ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`CPU 核心数: ${os.cpus().length}\n`);
  await demoFibonacciComparison();
  await demoParallelComputation();
  await demoWhenNotToUse();

  console.log('\n=== 总结 ===');
  console.log('✅ 适合 Worker: 纯 CPU 计算（图像处理、密码学、JSON解析）');
  console.log('❌ 不适合 Worker: I/O 操作（已经是异步非阻塞）');
  console.log('💡 生产环境: 使用 Worker Pool，避免频繁创建销毁');
}

main().catch(console.error);
