/**
 * Demo: 背压（Backpressure）实验
 * 演示生产者过快，消费者跟不上时，如何通过背压机制避免内存溢出
 *
 * 用法: node demo-backpressure.js
 */

'use strict';

const { Readable, Writable } = require('stream');

// ─────────────────────────────────────────────
// 场景 1：忽略背压（危险！模拟内存爆炸）
// ─────────────────────────────────────────────
function demoWithoutBackpressure() {
  return new Promise((resolve) => {
    console.log('\n[场景 1] 忽略背压（前 500 次写入）\n');

    const fastProducer = new Readable({
      read() {},
    });

    const slowConsumer = new Writable({
      write(chunk, encoding, callback) {
        // 模拟慢消费：500ms 处理一个 chunk
        setTimeout(callback, 50);
      },
    });

    let writeCount = 0;
    let maxBuffered = 0;

    // 每 1ms 推送一个 chunk（快速生产）
    const interval = setInterval(() => {
      if (writeCount >= 100) {
        clearInterval(interval);
        fastProducer.push(null);
        return;
      }

      // 直接 write，忽略返回值
      const ok = slowConsumer.write(Buffer.alloc(1024, writeCount % 256));
      writeCount++;

      // 计算缓冲区压力（writableLength 是缓冲字节数）
      const buffered = slowConsumer.writableLength;
      if (buffered > maxBuffered) maxBuffered = buffered;

      if (!ok) {
        process.stdout.write(`\r  [第 ${writeCount} 次] 缓冲区积压: ${(buffered / 1024).toFixed(1)} KB`);
      }
    }, 1);

    slowConsumer.on('finish', () => {
      console.log(`\n  结束。最大缓冲: ${(maxBuffered / 1024).toFixed(1)} KB`);
      resolve();
    });
  });
}

// ─────────────────────────────────────────────
// 场景 2：正确处理背压
// ─────────────────────────────────────────────
function demoWithBackpressure() {
  return new Promise((resolve) => {
    console.log('\n[场景 2] 正确的背压处理\n');

    const slowConsumer = new Writable({
      highWaterMark: 4 * 1024, // 4KB HWM
      write(chunk, encoding, callback) {
        setTimeout(callback, 10); // 慢消费
      },
    });

    let writeCount = 0;
    let pauseCount = 0;
    let maxBuffered = 0;

    function writeNext() {
      if (writeCount >= 100) {
        slowConsumer.end();
        return;
      }

      const ok = slowConsumer.write(Buffer.alloc(1024, writeCount % 256));
      writeCount++;

      const buffered = slowConsumer.writableLength;
      if (buffered > maxBuffered) maxBuffered = buffered;

      if (ok) {
        // 缓冲区还有空间，继续
        setImmediate(writeNext);
      } else {
        // 背压触发：等待 drain
        pauseCount++;
        process.stdout.write(
          `\r  [第 ${writeCount} 次] 背压暂停 #${pauseCount}，缓冲: ${(buffered / 1024).toFixed(1)} KB`
        );
        slowConsumer.once('drain', () => {
          process.stdout.write(`\r  drain 触发，恢复写入...                          `);
          writeNext();
        });
      }
    }

    slowConsumer.on('finish', () => {
      console.log(
        `\n  结束。写入次数: ${writeCount}，暂停次数: ${pauseCount}，最大缓冲: ${(maxBuffered / 1024).toFixed(1)} KB`
      );
      resolve();
    });

    writeNext();
  });
}

// ─────────────────────────────────────────────
// 场景 3：使用 pipe（自动背压）
// ─────────────────────────────────────────────
function demoPipeBackpressure() {
  return new Promise((resolve) => {
    console.log('\n[场景 3] pipe 自动背压管理\n');

    let pushCount = 0;
    const fastProducer = new Readable({
      highWaterMark: 8 * 1024,
      read() {
        if (pushCount >= 100) {
          this.push(null);
          return;
        }
        // push 返回 false 说明读端缓冲区满了
        const canContinue = this.push(Buffer.alloc(1024, pushCount % 256));
        pushCount++;
        if (!canContinue) {
          process.stdout.write(`\r  读端缓冲满，已推 ${pushCount} chunks`);
        }
      },
    });

    const slowConsumer = new Writable({
      highWaterMark: 4 * 1024,
      write(chunk, encoding, callback) {
        setTimeout(callback, 5);
      },
    });

    // pipe 自动处理背压：drain + pause/resume
    fastProducer.pipe(slowConsumer);

    slowConsumer.on('finish', () => {
      console.log(`\n  结束。共推送 ${pushCount} chunks（pipe 自动管理背压）`);
      resolve();
    });
  });
}

// ─────────────────────────────────────────────
// 主程序
// ─────────────────────────────────────────────
async function main() {
  console.log('=== 背压（Backpressure）实验 ===');
  console.log('HWM = highWaterMark（缓冲区建议上限）\n');

  await demoWithoutBackpressure();
  await demoWithBackpressure();
  await demoPipeBackpressure();

  console.log('\n=== 总结 ===');
  console.log('场景 1：忽略 write() 返回值 → 缓冲区无限积压');
  console.log('场景 2：检查 write() + drain → 缓冲区受控');
  console.log('场景 3：pipe() 自动封装背压逻辑 → 最简洁');
}

main().catch(console.error);
