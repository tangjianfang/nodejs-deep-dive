/**
 * demo-cpu-profile.js
 * 演示 CPU 性能问题诊断：热点函数识别、性能对比
 * 运行: node demo-cpu-profile.js
 * 使用 --prof: node --prof demo-cpu-profile.js && node --prof-process isolate-*.log
 */

'use strict';

const { performance } = require('perf_hooks');

// ─── 场景 1：低效的字符串拼接 ──────────────────────────────────────────────────

console.log('=== 场景 1：字符串拼接 ===');

function slowStringConcat(n) {
  let result = '';
  for (let i = 0; i < n; i++) {
    result += `item-${i},`; // ❌ 每次都创建新字符串
  }
  return result;
}

function fastStringConcat(n) {
  const parts = [];
  for (let i = 0; i < n; i++) {
    parts.push(`item-${i}`); // ✅ 最后一次 join
  }
  return parts.join(',');
}

const N = 100000;

let start = performance.now();
slowStringConcat(N);
console.log(`慢速拼接 ${N} 次: ${(performance.now() - start).toFixed(1)}ms`);

start = performance.now();
fastStringConcat(N);
console.log(`快速拼接 ${N} 次: ${(performance.now() - start).toFixed(1)}ms`);

// ─── 场景 2：低效的数组操作 ────────────────────────────────────────────────────

console.log('\n=== 场景 2：数组操作 ===');

const arr = Array.from({ length: 100000 }, (_, i) => ({ id: i, score: Math.random() * 100 }));

start = performance.now();
const slow = arr
  .filter(x => x.score > 50)
  .map(x => ({ ...x, grade: x.score > 90 ? 'A' : 'B' }))
  .sort((a, b) => b.score - a.score)
  .slice(0, 100);
const slowTime = performance.now() - start;

start = performance.now();
// 预先分配，减少中间数组
const fast = [];
for (const x of arr) {
  if (x.score > 50) {
    fast.push({ id: x.id, score: x.score, grade: x.score > 90 ? 'A' : 'B' });
  }
}
fast.sort((a, b) => b.score - a.score);
const top100 = fast.slice(0, 100);
const fastTime = performance.now() - start;

console.log(`chain filter/map/sort: ${slowTime.toFixed(1)}ms → 结果: ${slow.length} 条`);
console.log(`手动循环:              ${fastTime.toFixed(1)}ms → 结果: ${top100.length} 条`);

// ─── 场景 3：同步 vs 异步 CPU 密集操作 ────────────────────────────────────────

console.log('\n=== 场景 3：CPU 密集型 vs 异步分块 ===');

function isPrime(n) {
  if (n < 2) return false;
  for (let i = 2; i <= Math.sqrt(n); i++) if (n % i === 0) return false;
  return true;
}

// ❌ 阻塞事件循环
function findPrimesSync(limit) {
  const primes = [];
  for (let i = 2; i <= limit; i++) if (isPrime(i)) primes.push(i);
  return primes;
}

// ✅ 分块执行，不阻塞事件循环
function findPrimesAsync(limit) {
  return new Promise(resolve => {
    const primes = [];
    let i = 2;
    const CHUNK_SIZE = 1000;

    function processChunk() {
      const end = Math.min(i + CHUNK_SIZE, limit);
      for (; i < end; i++) {
        if (isPrime(i)) primes.push(i);
      }
      if (i >= limit) {
        resolve(primes);
      } else {
        setImmediate(processChunk); // 让出事件循环
      }
    }
    processChunk();
  });
}

const PRIME_LIMIT = 100000;

start = performance.now();
const syncPrimes = findPrimesSync(PRIME_LIMIT);
const syncTime = performance.now() - start;
console.log(`同步找素数(1-${PRIME_LIMIT}): ${syncTime.toFixed(0)}ms，找到 ${syncPrimes.length} 个`);
console.log('⚠️  同步期间，其他 I/O 事件被阻塞！');

let interleaved = 0;
const checkTimer = setInterval(() => interleaved++, 1); // 检测是否被打断

start = performance.now();
findPrimesAsync(PRIME_LIMIT).then(asyncPrimes => {
  clearInterval(checkTimer);
  const asyncTime = performance.now() - start;
  console.log(`\n异步找素数(1-${PRIME_LIMIT}): ${asyncTime.toFixed(0)}ms，找到 ${asyncPrimes.length} 个`);
  console.log(`✅ 期间事件循环被触发 ${interleaved} 次（其他 I/O 可以运行）`);
  printSummary();
});

// ─── 场景 4：Performance API 标记 ─────────────────────────────────────────────

const { PerformanceObserver } = require('perf_hooks');

const obs = new PerformanceObserver((list) => {
  list.getEntries().forEach(entry => {
    console.log(`\n[perf] ${entry.name}: ${entry.duration.toFixed(2)}ms`);
  });
  obs.disconnect();
});
obs.observe({ entryTypes: ['measure'] });

performance.mark('operation-start');
// 模拟操作
let sum = 0;
for (let i = 0; i < 10_000_000; i++) sum += i;
performance.mark('operation-end');
performance.measure('sum-10M', 'operation-start', 'operation-end');

function printSummary() {
  console.log('\n=== 性能优化总结 ===');
  console.log('1. 字符串拼接   → 使用 Array.join');
  console.log('2. CPU 密集     → setImmediate 分块 or Worker Thread');
  console.log('3. 性能测量     → performance.mark/measure');
  console.log('4. CPU 分析     → node --prof + clinic flame');
}
