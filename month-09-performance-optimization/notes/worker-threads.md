# Worker Threads 深度解析

## 1. Node.js 并发模型

```
单线程（默认）:
  Main Thread ─── Event Loop ─── V8 ─── libuv
                      │
                      └── I/O（异步，交给 libuv 线程池）

Worker Threads（CPU 密集型）:
  Main Thread ─┬─ Worker 1 ─ V8 (独立堆)
               ├─ Worker 2 ─ V8
               └─ Worker 3 ─ V8
  
  通信: postMessage（复制）或 SharedArrayBuffer（共享）
```

---

## 2. 什么时候用 Worker Threads？

| 场景 | 推荐方案 |
|------|---------|
| 图片/视频处理 | Worker Thread |
| 密码学计算 | Worker Thread |
| JSON 大文件解析 | Worker Thread |
| 机器学习推理 | Worker Thread |
| 文件 I/O | 默认即可（libuv 线程池）|
| HTTP 请求 | 默认即可（非阻塞）|

---

## 3. 基本用法

```javascript
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

if (isMainThread) {
  // 主线程
  const worker = new Worker(__filename, {
    workerData: { numbers: [1, 2, 3, 4, 5] },
  });

  worker.on('message', result => console.log('结果:', result));
  worker.on('error', err => console.error('错误:', err));
  worker.on('exit', code => console.log('退出代码:', code));
} else {
  // Worker 线程
  const { numbers } = workerData;
  const sum = numbers.reduce((a, b) => a + b, 0);
  parentPort.postMessage({ sum });
}
```

---

## 4. Worker Pool 模式

```javascript
const { Worker } = require('worker_threads');
const os = require('os');

class WorkerPool {
  constructor(workerFile, poolSize = os.cpus().length) {
    this._workers = [];
    this._queue = [];
    this._available = [];

    for (let i = 0; i < poolSize; i++) {
      const worker = new Worker(workerFile);
      worker.on('message', (result) => {
        const { resolve } = worker._currentTask;
        worker._currentTask = null;
        this._available.push(worker);
        resolve(result);
        this._runNext();
      });
      worker.on('error', (err) => {
        const { reject } = worker._currentTask;
        worker._currentTask = null;
        this._available.push(worker);
        reject(err);
        this._runNext();
      });
      this._workers.push(worker);
      this._available.push(worker);
    }
  }

  run(data) {
    return new Promise((resolve, reject) => {
      this._queue.push({ data, resolve, reject });
      this._runNext();
    });
  }

  _runNext() {
    if (this._queue.length === 0 || this._available.length === 0) return;
    const task   = this._queue.shift();
    const worker = this._available.shift();
    worker._currentTask = task;
    worker.postMessage(task.data);
  }

  async destroy() {
    await Promise.all(this._workers.map(w => w.terminate()));
  }
}
```

---

## 5. SharedArrayBuffer & Atomics

```javascript
// 主线程和 Worker 共享内存（零拷贝）
const sharedBuffer = new SharedArrayBuffer(4 * Int32Array.BYTES_PER_ELEMENT);
const sharedArray  = new Int32Array(sharedBuffer);

// 原子操作，线程安全
Atomics.add(sharedArray, 0, 1);     // 原子 ++
Atomics.load(sharedArray, 0);        // 原子读
Atomics.store(sharedArray, 0, 100); // 原子写

// 等待/通知（类似 mutex）
Atomics.wait(sharedArray, 0, 0);     // 等待 [0] 不等于 0
Atomics.notify(sharedArray, 0, 1);   // 通知一个等待的线程
```

---

## 6. 实践 Checklist

- [ ] 运行 `demo-worker-threads.js`，对比单线程与多线程 Fibonacci
- [ ] 实现一个简单的 WorkerPool，并行处理图片缩放任务
- [ ] 用 SharedArrayBuffer 实现线程间共享计数器
- [ ] 测量大 JSON 文件解析移到 Worker 后的主线程响应时间改善
