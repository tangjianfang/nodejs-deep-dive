/**
 * Demo: stream/promises pipeline API
 * 演示如何用 pipeline 实现健壮的流式数据处理
 * 包含：错误传播、资源自动清理、中途取消
 *
 * 用法: node demo-pipeline.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');
const { createGzip, createGunzip } = require('zlib');

// ─────────────────────────────────────────────
// Demo 1：基本 pipeline（文本处理）
// ─────────────────────────────────────────────
async function demoBasicPipeline() {
  console.log('\n[Demo 1] 基本 pipeline：数字流 → 过滤 → 平方 → 收集\n');

  const numbers = Readable.from(
    (function* () {
      for (let i = 1; i <= 20; i++) yield i;
    })()
  );

  const filterOdd = new Transform({
    objectMode: true,
    transform(n, enc, cb) {
      if (n % 2 === 0) this.push(n); // 只保留偶数
      cb();
    },
  });

  const square = new Transform({
    objectMode: true,
    transform(n, enc, cb) {
      this.push(n * n);
      cb();
    },
  });

  const results = [];
  const collect = new Transform({
    objectMode: true,
    transform(n, enc, cb) {
      results.push(n);
      cb();
    },
  });

  await pipeline(numbers, filterOdd, square, collect);

  console.log('偶数的平方:', results.join(', '));
  // 4, 16, 36, 64, 100, 144, 196, 256, 324, 400
}

// ─────────────────────────────────────────────
// Demo 2：gzip 压缩 pipeline
// ─────────────────────────────────────────────
async function demoGzipPipeline() {
  console.log('\n[Demo 2] Gzip 压缩/解压 pipeline\n');

  const originalData = 'Node.js Stream is awesome!\n'.repeat(1000);
  const originalSize = Buffer.byteLength(originalData, 'utf8');

  // 压缩
  const compressed = [];
  await pipeline(
    Readable.from([originalData]),
    createGzip({ level: 9 }),
    new Transform({
      transform(chunk, enc, cb) {
        compressed.push(chunk);
        cb();
      },
    })
  );
  const compressedBuf = Buffer.concat(compressed);

  console.log(`原始大小: ${originalSize} bytes`);
  console.log(`压缩后: ${compressedBuf.length} bytes`);
  console.log(`压缩率: ${((1 - compressedBuf.length / originalSize) * 100).toFixed(1)}%`);

  // 解压
  const decompressed = [];
  await pipeline(
    Readable.from([compressedBuf]),
    createGunzip(),
    new Transform({
      transform(chunk, enc, cb) {
        decompressed.push(chunk);
        cb();
      },
    })
  );
  const decompressedStr = Buffer.concat(decompressed).toString('utf8');
  console.log(`解压后一致: ${decompressedStr === originalData}`);
}

// ─────────────────────────────────────────────
// Demo 3：pipeline 错误处理 & 资源清理
// ─────────────────────────────────────────────
async function demoPipelineErrorHandling() {
  console.log('\n[Demo 3] pipeline 错误传播与资源自动清理\n');

  let cleanupCalled = false;

  const source = new Readable({
    read() {},
  });

  const explodeAt5 = new Transform({
    transform(chunk, enc, cb) {
      const n = parseInt(chunk.toString());
      if (n === 5) return cb(new Error(`爆炸！收到了数字 ${n}`));
      this.push(`processed: ${n}\n`);
      cb();
    },
    destroy(err, cb) {
      cleanupCalled = true;
      console.log('  Transform stream 已销毁（自动清理）');
      cb(err);
    },
  });

  const sink = new Transform({
    transform(chunk, enc, cb) {
      process.stdout.write('  ' + chunk.toString());
      cb();
    },
  });

  // 推送数据
  for (let i = 1; i <= 10; i++) {
    source.push(String(i));
  }
  source.push(null);

  try {
    await pipeline(source, explodeAt5, sink);
    console.log('（不应到这里）');
  } catch (err) {
    console.log(`  捕获到错误: ${err.message}`);
    console.log(`  资源自动清理: ${cleanupCalled}`);
  }
}

// ─────────────────────────────────────────────
// Demo 4：使用 AbortController 中途取消
// ─────────────────────────────────────────────
async function demoPipelineAbort() {
  console.log('\n[Demo 4] AbortController 中途取消 pipeline\n');

  const controller = new AbortController();
  const { signal } = controller;

  let pushCount = 0;
  const infiniteSource = new Readable({
    async read() {
      await new Promise((resolve) => setTimeout(resolve, 50));
      this.push(`chunk-${++pushCount}\n`);
    },
  });

  const slowTransform = new Transform({
    transform(chunk, enc, cb) {
      this.push(chunk);
      cb();
    },
  });

  const sink = new Transform({
    transform(chunk, enc, cb) {
      process.stdout.write('  ' + chunk.toString());
      cb();
    },
  });

  // 2 秒后取消
  setTimeout(() => {
    console.log('\n  2 秒到，发送取消信号...');
    controller.abort();
  }, 500);

  try {
    await pipeline(infiniteSource, slowTransform, sink, { signal });
  } catch (err) {
    if (err.code === 'ABORT_ERR') {
      console.log(`  Pipeline 被取消（共处理了 ${pushCount} 个 chunk）`);
    } else {
      throw err;
    }
  }
}

// ─────────────────────────────────────────────
// 主程序
// ─────────────────────────────────────────────
async function main() {
  console.log('=== stream/promises pipeline Demo ===');

  await demoBasicPipeline();
  await demoGzipPipeline();
  await demoPipelineErrorHandling();
  await demoPipelineAbort();

  console.log('\n=== 完成 ===\n');
}

main().catch(console.error);
