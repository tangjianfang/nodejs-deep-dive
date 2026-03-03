/**
 * demo-circuit-breaker.js
 * 熔断器完整实现（CLOSED → OPEN → HALF_OPEN 状态机）
 */

'use strict';

// ─── 熔断器实现 ────────────────────────────────────────────────────────────────

const STATE = { CLOSED: 'CLOSED', OPEN: 'OPEN', HALF_OPEN: 'HALF_OPEN' };

class CircuitBreaker {
  /**
   * @param {Function} fn              - 被保护的函数
   * @param {Object}   options
   * @param {number}   options.failureThreshold  - 触发熔断的失败次数（默认 5）
   * @param {number}   options.successThreshold  - 半开状态成功多少次才恢复（默认 2）
   * @param {number}   options.timeout           - 熔断持续时间 ms（默认 10000）
   * @param {number}   options.callTimeout       - 单次调用超时 ms（默认 3000）
   */
  constructor(fn, options = {}) {
    this._fn               = fn;
    this._failureThreshold = options.failureThreshold || 5;
    this._successThreshold = options.successThreshold || 2;
    this._timeout          = options.timeout   || 10000;
    this._callTimeout      = options.callTimeout || 3000;

    this._state          = STATE.CLOSED;
    this._failureCount   = 0;
    this._successCount   = 0;
    this._lastFailureTime = null;
    this._stats          = { totalCalls: 0, failures: 0, rejections: 0, successes: 0 };
  }

  get state() { return this._state; }

  async call(...args) {
    this._stats.totalCalls++;
    this._checkState();

    if (this._state === STATE.OPEN) {
      this._stats.rejections++;
      throw new Error(`CircuitBreaker is OPEN (fast fail)`);
    }

    try {
      const result = await this._callWithTimeout(...args);
      this._onSuccess();
      return result;
    } catch (err) {
      this._onFailure(err);
      throw err;
    }
  }

  _checkState() {
    if (this._state === STATE.OPEN) {
      const elapsed = Date.now() - this._lastFailureTime;
      if (elapsed >= this._timeout) {
        console.log(`  [CB] ${this._timeout}ms 超时，转为 HALF_OPEN`);
        this._state = STATE.HALF_OPEN;
        this._successCount = 0;
      }
    }
  }

  _callWithTimeout(...args) {
    return Promise.race([
      this._fn(...args),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Call timeout')), this._callTimeout)
      ),
    ]);
  }

  _onSuccess() {
    this._stats.successes++;
    if (this._state === STATE.HALF_OPEN) {
      this._successCount++;
      if (this._successCount >= this._successThreshold) {
        console.log(`  [CB] HALF_OPEN → CLOSED（${this._successThreshold} 次成功）`);
        this._state = STATE.CLOSED;
        this._failureCount = 0;
        this._successCount = 0;
      }
    } else {
      this._failureCount = 0; // 成功重置失败计数
    }
  }

  _onFailure(err) {
    this._stats.failures++;
    this._failureCount++;
    this._lastFailureTime = Date.now();

    if (this._state === STATE.HALF_OPEN) {
      console.log(`  [CB] HALF_OPEN → OPEN（试探失败：${err.message}）`);
      this._state = STATE.OPEN;
    } else if (this._failureCount >= this._failureThreshold) {
      console.log(`  [CB] CLOSED → OPEN（失败 ${this._failureCount} 次: ${err.message}）`);
      this._state = STATE.OPEN;
    }
  }

  stats() { return { state: this._state, ...this._stats, failureCount: this._failureCount }; }
}

// ─── 演示 ──────────────────────────────────────────────────────────────────────

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  let shouldFail = true;

  async function externalService(callId) {
    await sleep(20);
    if (shouldFail) {
      throw new Error(`Service unavailable (call ${callId})`);
    }
    return `Success (call ${callId})`;
  }

  const cb = new CircuitBreaker(externalService, {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 500,  // 0.5 秒后半开（演示用）
  });

  console.log('=== 熔断器演示 ===\n');

  // 阶段 1：正常调用（成功）
  console.log('--- 阶段 1：正常调用 ---');
  shouldFail = false;
  for (let i = 1; i <= 3; i++) {
    const result = await cb.call(i);
    console.log(`  调用 #${i}: ${result} [${cb.state}]`);
  }

  // 阶段 2：服务故障（熔断触发）
  console.log('\n--- 阶段 2：服务故障，触发熔断 ---');
  shouldFail = true;
  for (let i = 4; i <= 8; i++) {
    try {
      await cb.call(i);
    } catch (err) {
      console.log(`  调用 #${i}: ❌ ${err.message} [${cb.state}]`);
    }
    if (cb.state === STATE.OPEN) {
      console.log(`  → 熔断已打开，后续请求快速失败`);
      break;
    }
  }

  // 阶段 3：熔断状态（快速失败）
  console.log('\n--- 阶段 3：OPEN 状态（快速失败）---');
  for (let i = 0; i < 3; i++) {
    try { await cb.call(99); } catch (err) {
      console.log(`  快速失败: ${err.message} [${cb.state}]`);
    }
  }

  // 阶段 4：等待超时，进入 HALF_OPEN
  console.log('\n--- 阶段 4：等待 500ms 进入 HALF_OPEN ---');
  await sleep(600);

  // 阶段 5：HALF_OPEN 中成功恢复
  console.log('--- 阶段 5：HALF_OPEN - 服务恢复，试探 ---');
  shouldFail = false;
  for (let i = 10; i <= 14; i++) {
    try {
      const result = await cb.call(i);
      console.log(`  调用 #${i}: ${result} [${cb.state}]`);
    } catch (err) {
      console.log(`  调用 #${i}: ❌ ${err.message} [${cb.state}]`);
    }
  }

  console.log('\n=== 最终统计 ===');
  console.log(cb.stats());
}

main().catch(console.error);
