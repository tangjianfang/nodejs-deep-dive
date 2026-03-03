/**
 * 🚦 demo-concurrent-limiter.js
 * 并发控制器：限制最大并发数
 *
 * 运行：node demo-concurrent-limiter.js
 */

'use strict';

// ─────────────────────────────────────────────
// 1. 核心实现：ConcurrentLimiter
// ─────────────────────────────────────────────

class ConcurrentLimiter {
  #maxConcurrent;
  #active = 0;
  #queue = [];
  #completed = 0;
  #failed = 0;

  constructor(maxConcurrent = 5) {
    if (maxConcurrent < 1) throw new RangeError('maxConcurrent must be >= 1');
    this.#maxConcurrent = maxConcurrent;
  }

  /**
   * 添加一个任务（返回 Promise）
   * @param {() => Promise} fn 任务函数
   * @param {{ timeout?: number }} options
   */
  add(fn, { timeout } = {}) {
    return new Promise((resolve, reject) => {
      const task = { fn, resolve, reject, timeout };
      this.#queue.push(task);
      this.#next();
    });
  }

  #next() {
    if (this.#active >= this.#maxConcurrent || this.#queue.length === 0) return;

    this.#active++;
    const { fn, resolve, reject, timeout } = this.#queue.shift();
    console.log(`  [limiter] active=${this.#active} queue=${this.#queue.length}`);

    let task = Promise.resolve().then(() => fn());

    // 超时包装
    if (timeout) {
      task = Promise.race([
        task,
        new Promise((_, r) =>
          setTimeout(() => r(new Error(`Task timeout after ${timeout}ms`)), timeout)
        ),
      ]);
    }

    task.then(
      (value) => {
        this.#completed++;
        resolve(value);
      },
      (reason) => {
        this.#failed++;
        reject(reason);
      }
    ).finally(() => {
      this.#active--;
      this.#next(); // 完成一个，提取下一个
    });
  }

  get stats() {
    return {
      active: this.#active,
      queued: this.#queue.length,
      completed: this.#completed,
      failed: this.#failed,
    };
  }
}

// ─────────────────────────────────────────────
// 2. 模拟任务
// ─────────────────────────────────────────────

function simulateApiCall(id, delayMs) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ id, data: `result-${id}`, time: delayMs });
    }, delayMs);
  });
}

// ─────────────────────────────────────────────
// 3. 演示
// ─────────────────────────────────────────────

async function main() {
  const TOTAL_TASKS = 20;
  const MAX_CONCURRENT = 3;

  console.log(`\n📊 并发控制器演示`);
  console.log(`任务总数: ${TOTAL_TASKS}`);
  console.log(`最大并发: ${MAX_CONCURRENT}`);
  console.log('─'.repeat(50));

  // ── 对比 1：无限制并发 ───────────────────────
  console.log('\n❌ 无限制并发（Promise.all）:');
  const unlimited_start = Date.now();
  const tasks = Array.from({ length: TOTAL_TASKS }, (_, i) =>
    simulateApiCall(i, 100 + Math.random() * 50)
  );
  await Promise.all(tasks);
  console.log(`   耗时: ${Date.now() - unlimited_start}ms（同时发起${TOTAL_TASKS}个请求）`);

  // ── 对比 2：限流并发 ─────────────────────────
  console.log(`\n✅ 限流并发（最多 ${MAX_CONCURRENT} 个）:`);
  const limiter = new ConcurrentLimiter(MAX_CONCURRENT);
  const limited_start = Date.now();

  const results = await Promise.all(
    Array.from({ length: TOTAL_TASKS }, (_, i) =>
      limiter.add(() => simulateApiCall(i, 100 + Math.random() * 50))
    )
  );

  const duration = Date.now() - limited_start;
  console.log(`   耗时: ${duration}ms`);
  console.log(`   完成任务: ${results.length}个`);
  console.log(`   最终统计:`, limiter.stats);

  // ── 验证并发数精确性 ─────────────────────────
  console.log('\n🔍 验证并发数精确性:');
  const precisionLimiter = new ConcurrentLimiter(MAX_CONCURRENT);
  let maxObservedConcurrent = 0;
  let currentConcurrent = 0;

  await Promise.all(
    Array.from({ length: 15 }, (_, i) =>
      precisionLimiter.add(async () => {
        currentConcurrent++;
        maxObservedConcurrent = Math.max(maxObservedConcurrent, currentConcurrent);
        await new Promise((r) => setTimeout(r, 50));
        currentConcurrent--;
        return i;
      })
    )
  );

  console.log(`   最大观测并发数: ${maxObservedConcurrent}`);
  console.log(`   设定最大并发数: ${MAX_CONCURRENT}`);
  console.log(`   验证结果: ${maxObservedConcurrent <= MAX_CONCURRENT ? '✅ PASS' : '❌ FAIL'}`);

  // ── 超时测试 ─────────────────────────────────
  console.log('\n⏱️  超时测试:');
  const timeoutLimiter = new ConcurrentLimiter(5);
  const tasks2 = [
    timeoutLimiter.add(() => simulateApiCall(1, 50), { timeout: 200 }),   // 成功
    timeoutLimiter.add(() => simulateApiCall(2, 50), { timeout: 200 }),   // 成功
    timeoutLimiter.add(() => simulateApiCall(3, 500), { timeout: 200 }),  // 超时
  ];

  const settled = await Promise.allSettled(tasks2);
  settled.forEach(({ status, value, reason }, i) => {
    const icon = status === 'fulfilled' ? '✅' : '❌';
    const msg = status === 'fulfilled' ? `id=${value.id}` : reason.message;
    console.log(`   任务${i + 1}: ${icon} ${status} - ${msg}`);
  });
}

main().catch(console.error);
