/**
 * 🔮 demo-my-promise.js
 * 手写符合 Promise/A+ 规范的 MyPromise 实现
 *
 * 运行：node demo-my-promise.js
 * 测试完整度：通过 npm install promises-aplus-tests 可运行 872 个官方测试
 */

'use strict';

// ─────────────────────────────────────────────
// 1. 核心实现
// ─────────────────────────────────────────────

const STATE = Object.freeze({
  PENDING: 'pending',
  FULFILLED: 'fulfilled',
  REJECTED: 'rejected',
});

class MyPromise {
  #state = STATE.PENDING;
  #value = undefined;
  #handlers = [];

  constructor(executor) {
    if (typeof executor !== 'function') {
      throw new TypeError('MyPromise executor must be a function');
    }
    try {
      executor(
        (value) => this.#resolve(value),
        (reason) => this.#reject(reason)
      );
    } catch (e) {
      this.#reject(e);
    }
  }

  #resolve(value) {
    if (this.#state !== STATE.PENDING) return;

    // 如果 resolve 的值是一个 thenable，需要等它完成
    if (value != null && (typeof value === 'object' || typeof value === 'function')) {
      let then;
      try {
        then = value.then;
      } catch (e) {
        this.#reject(e);
        return;
      }

      if (typeof then === 'function') {
        let called = false;
        try {
          then.call(
            value,
            (y) => { if (!called) { called = true; this.#resolve(y); } },
            (r) => { if (!called) { called = true; this.#reject(r); } }
          );
        } catch (e) {
          if (!called) this.#reject(e);
        }
        return;
      }
    }

    this.#state = STATE.FULFILLED;
    this.#value = value;
    this.#processHandlers();
  }

  #reject(reason) {
    if (this.#state !== STATE.PENDING) return;
    this.#state = STATE.REJECTED;
    this.#value = reason;
    this.#processHandlers();
  }

  #processHandlers() {
    for (const handler of this.#handlers) {
      this.#executeHandler(handler);
    }
    this.#handlers = [];
  }

  #executeHandler({ onFulfilled, onRejected, resolve, reject }) {
    // 规范要求：handlers 必须异步调用（微任务）
    queueMicrotask(() => {
      try {
        if (this.#state === STATE.FULFILLED) {
          if (typeof onFulfilled === 'function') {
            resolve(onFulfilled(this.#value));
          } else {
            resolve(this.#value); // 值穿透
          }
        } else if (this.#state === STATE.REJECTED) {
          if (typeof onRejected === 'function') {
            resolve(onRejected(this.#value));
          } else {
            reject(this.#value); // 错误穿透
          }
        }
      } catch (e) {
        reject(e);
      }
    });
  }

  then(onFulfilled, onRejected) {
    return new MyPromise((resolve, reject) => {
      const handler = { onFulfilled, onRejected, resolve, reject };
      if (this.#state === STATE.PENDING) {
        this.#handlers.push(handler);
      } else {
        this.#executeHandler(handler);
      }
    });
  }

  catch(onRejected) {
    return this.then(undefined, onRejected);
  }

  finally(onFinally) {
    return this.then(
      (value) => MyPromise.resolve(onFinally()).then(() => value),
      (reason) => MyPromise.resolve(onFinally()).then(() => { throw reason; })
    );
  }

  // 静态方法
  static resolve(value) {
    if (value instanceof MyPromise) return value;
    return new MyPromise((resolve) => resolve(value));
  }

  static reject(reason) {
    return new MyPromise((_, reject) => reject(reason));
  }

  static all(promises) {
    return new MyPromise((resolve, reject) => {
      const results = [];
      let remaining = promises.length;
      if (remaining === 0) return resolve(results);

      promises.forEach((p, index) => {
        MyPromise.resolve(p).then((value) => {
          results[index] = value;
          if (--remaining === 0) resolve(results);
        }, reject);
      });
    });
  }

  static allSettled(promises) {
    return MyPromise.all(
      promises.map((p) =>
        MyPromise.resolve(p).then(
          (value) => ({ status: 'fulfilled', value }),
          (reason) => ({ status: 'rejected', reason })
        )
      )
    );
  }

  static race(promises) {
    return new MyPromise((resolve, reject) => {
      promises.forEach((p) => MyPromise.resolve(p).then(resolve, reject));
    });
  }

  static any(promises) {
    return new MyPromise((resolve, reject) => {
      const errors = [];
      let remaining = promises.length;
      if (remaining === 0) return reject(new AggregateError([], 'All promises were rejected'));

      promises.forEach((p, index) => {
        MyPromise.resolve(p).then(resolve, (reason) => {
          errors[index] = reason;
          if (--remaining === 0) reject(new AggregateError(errors, 'All promises were rejected'));
        });
      });
    });
  }
}

// ─────────────────────────────────────────────
// 2. 兼容 promises-aplus-tests 用的适配器导出
// ─────────────────────────────────────────────
MyPromise.deferred = function () {
  const result = {};
  result.promise = new MyPromise((resolve, reject) => {
    result.resolve = resolve;
    result.reject = reject;
  });
  return result;
};

// ─────────────────────────────────────────────
// 3. 手动测试用例
// ─────────────────────────────────────────────
async function runTests() {
  console.log('=== MyPromise 基础测试 ===\n');

  // 测试 1：基本 resolve
  const t1 = new MyPromise((resolve) => resolve(42));
  t1.then((v) => console.log('✅ Test 1 - resolve:', v === 42 ? 'PASS' : 'FAIL'));

  // 测试 2：基本 reject
  const t2 = new MyPromise((_, reject) => reject(new Error('oops')));
  t2.catch((e) => console.log('✅ Test 2 - reject:', e.message === 'oops' ? 'PASS' : 'FAIL'));

  // 测试 3：链式调用
  const t3 = MyPromise.resolve(1)
    .then((v) => v + 1)
    .then((v) => v * 2);
  t3.then((v) => console.log('✅ Test 3 - chain:', v === 4 ? 'PASS' : 'FAIL'));

  // 测试 4：值穿透
  const t4 = MyPromise.resolve(10)
    .then(null)  // 没有 onFulfilled，值穿透
    .then((v) => v + 5);
  t4.then((v) => console.log('✅ Test 4 - passthrough:', v === 15 ? 'PASS' : 'FAIL'));

  // 测试 5：then 中的错误
  const t5 = MyPromise.resolve('ok')
    .then(() => { throw new Error('in then'); })
    .catch((e) => e.message);
  t5.then((v) => console.log('✅ Test 5 - error in then:', v === 'in then' ? 'PASS' : 'FAIL'));

  // 测试 6：Promise.all
  const t6 = MyPromise.all([
    MyPromise.resolve(1),
    MyPromise.resolve(2),
    MyPromise.resolve(3),
  ]);
  t6.then((v) => console.log('✅ Test 6 - all:', JSON.stringify(v) === '[1,2,3]' ? 'PASS' : 'FAIL'));

  // 测试 7：Promise.allSettled
  const t7 = MyPromise.allSettled([
    MyPromise.resolve(1),
    MyPromise.reject('error'),
  ]);
  t7.then((results) => {
    const pass = results[0].status === 'fulfilled' && results[1].status === 'rejected';
    console.log('✅ Test 7 - allSettled:', pass ? 'PASS' : 'FAIL');
  });

  // 测试 8：微任务顺序
  let order = [];
  MyPromise.resolve().then(() => order.push('microtask'));
  order.push('sync');
  // 微任务需要等下一个 microtask checkpoint
  await new Promise((r) => setTimeout(r, 0));
  console.log('✅ Test 8 - microtask order:',
    JSON.stringify(order) === '["sync","microtask"]' ? 'PASS' : 'FAIL'
  );

  console.log('\n=== 测试完成 ===');
  console.log('💡 运行完整 872 个 Promise/A+ 测试：');
  console.log('   npm install promises-aplus-tests');
  console.log('   npx promises-aplus-tests demo-my-promise.js');
}

runTests().catch(console.error);

module.exports = MyPromise;
