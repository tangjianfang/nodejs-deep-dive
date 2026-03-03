/**
 * demo-koa-compose.js
 * 从零实现 koa-compose，演示洋葱模型
 * 包含: 基础实现、计时中间件、错误传播、多层嵌套对比
 *
 * 运行: node demo-koa-compose.js
 */

// ─── 实现 koa-compose ────────────────────────────────────────────────────────────

/**
 * koa-compose 核心实现（完整版，与官方 36 行一致）
 * @param {Array<Function>} middleware - async (ctx, next) => {} 数组
 * @returns {Function} - async (ctx, next?) => {}
 */
function compose(middleware) {
  if (!Array.isArray(middleware)) throw new TypeError('Middleware stack must be an array!');
  for (const fn of middleware) {
    if (typeof fn !== 'function') throw new TypeError('Middleware must be composed of functions!');
  }

  return function(context, next) {
    let index = -1;

    return dispatch(0);

    function dispatch(i) {
      // 防止同一中间件多次调用 next()
      if (i <= index) return Promise.reject(new Error('next() called multiple times'));
      index = i;

      let fn = middleware[i];
      if (i === middleware.length) fn = next; // 最后一个中间件后调用传入的 next
      if (!fn) return Promise.resolve();

      try {
        return Promise.resolve(
          fn(context, function next() {
            return dispatch(i + 1);
          })
        );
      } catch (err) {
        return Promise.reject(err);
      }
    }
  };
}

// ─── 基础演示：洋葱执行顺序 ──────────────────────────────────────────────────────

async function demo1_basicOrder() {
  console.log('\n═══════ Demo 1: 洋葱执行顺序 ═══════');

  const ctx = { logs: [] };
  const middlewares = [];

  // 注册 3 个中间件
  middlewares.push(async (ctx, next) => {
    ctx.logs.push('1 进入');
    await next();
    ctx.logs.push('1 退出');
  });

  middlewares.push(async (ctx, next) => {
    ctx.logs.push('2 进入');
    await next();
    ctx.logs.push('2 退出');
  });

  middlewares.push(async (ctx, next) => {
    ctx.logs.push('3 处理请求');
    ctx.body = 'Hello from route handler';
    // 没有 await next()，但不影响洋葱模型
  });

  const fn = compose(middlewares);
  await fn(ctx);

  console.log('执行顺序:', ctx.logs.join(' → '));
  console.log('响应体:', ctx.body);
  
  console.log('\n✓ 洋葱模型：1进 → 2进 → 3处理 → 2退 → 1退');
  console.log('  Express 直线模型：1进 → 2进 → 3处理（1退、2退 可能不被调用或顺序不预期）');
}

// ─── Demo 2: 计时中间件 ───────────────────────────────────────────────────────────

async function demo2_timing() {
  console.log('\n═══════ Demo 2: 计时中间件（洋葱模型的典型应用）═══════');

  const ctx = { url: '/api/users', method: 'GET' };
  const middlewares = [];

  // 计时中间件（利用了洋葱的 before/after 特性）
  middlewares.push(async (ctx, next) => {
    const start = Date.now();
    await next(); // 等待所有后续中间件完成
    const ms = Date.now() - start;
    ctx.responseTime = ms;
    console.log(`  ⏱ ${ctx.method} ${ctx.url} - ${ms}ms`);
  });

  // 日志中间件
  middlewares.push(async (ctx, next) => {
    console.log(`  → 请求开始: ${ctx.method} ${ctx.url}`);
    await next();
    console.log(`  ← 请求结束: status=${ctx.status}`);
  });

  // 模拟路由处理（有延迟）
  middlewares.push(async (ctx, next) => {
    await new Promise(r => setTimeout(r, 50)); // 模拟 DB 查询
    ctx.status = 200;
    ctx.body = { users: ['Alice', 'Bob'] };
  });

  const fn = compose(middlewares);
  await fn(ctx);
  
  console.log(`\n  最终结果: status=${ctx.status}, responseTime=${ctx.responseTime}ms`);
  console.log('  ✓ 计时中间件只需 2 行：const start = Date.now(); await next(); const ms = ...');
  console.log('  ✓ Express 要实现同样效果需要 hack res.end()，更复杂');
}

// ─── Demo 3: 错误传播 ─────────────────────────────────────────────────────────────

async function demo3_errorHandling() {
  console.log('\n═══════ Demo 3: 错误传播 ═══════');

  const middlewares = [];

  // 全局错误处理（作为最外层中间件）
  middlewares.push(async (ctx, next) => {
    try {
      await next();
    } catch (err) {
      ctx.status = err.status || 500;
      ctx.body = { error: err.message };
      console.log(`  ✓ 错误被最外层中间件捕获: ${err.message}`);
    }
  });

  // 普通中间件（会"经过"错误）
  middlewares.push(async (ctx, next) => {
    console.log('  中间件2 执行（错误前）');
    await next(); // 错误会从这里向外传播
    console.log('  中间件2 执行（错误后）← 不会执行！');
  });

  // 抛出错误的路由
  middlewares.push(async (ctx, next) => {
    const err = new Error('Database connection failed');
    err.status = 503;
    throw err; // 抛出错误！
  });

  const ctx = {};
  const fn = compose(middlewares);
  await fn(ctx);
  
  console.log('  最终 ctx:', ctx);
}

// ─── Demo 4: 防止多次调用 next() ──────────────────────────────────────────────────

async function demo4_multipleNext() {
  console.log('\n═══════ Demo 4: 防止多次调用 next() ═══════');
  
  const middlewares = [
    async (ctx, next) => {
      await next(); // 第一次调用
      try {
        await next(); // 第二次调用 → 应该报错！
      } catch (err) {
        console.log(`  ✓ 捕获到期望错误: ${err.message}`);
      }
    },
    async (ctx, next) => {
      ctx.count = (ctx.count || 0) + 1;
      console.log(`  路由处理器被调用第 ${ctx.count} 次`);
    },
  ];

  const ctx = {};
  await compose(middlewares)(ctx);
  console.log(`  最终 count = ${ctx.count}（应该是1，因为第2次 next() 被阻止）`);
}

// ─── Demo 5: compose 嵌套 + forking ──────────────────────────────────────────────

async function demo5_nestedCompose() {
  console.log('\n═══════ Demo 5: compose 嵌套（内层和外层中间件协同）═══════');

  // 外层中间件（如全局 app 级别）
  const globalMiddlewares = [
    async (ctx, next) => {
      ctx.logs = [];
      ctx.logs.push('global:auth');
      await next();
      console.log('  执行路径:', ctx.logs.join(' → '));
    },
    async (ctx, next) => {
      ctx.logs.push('global:logger');
      await next();
    },
  ];

  // 内层中间件（如路由级别）
  const routeMiddlewares = [
    async (ctx, next) => {
      ctx.logs.push('route:validate');
      await next();
    },
    async (ctx, next) => {
      ctx.logs.push('route:handler');
      ctx.body = { message: 'ok' };
    },
  ];

  // 将内层作为外层的最终 next
  const routeLine = compose(routeMiddlewares);
  const globalLine = compose(globalMiddlewares);

  const ctx = {};
  await globalLine(ctx, () => routeLine(ctx));
  
  console.log('  ✓ 洋葱模型可以嵌套，实现模块化中间件管理');
}

// ─── Demo 6: 与 Express 的对比 ────────────────────────────────────────────────────

async function demo6_expressComparison() {
  console.log('\n═══════ Demo 6: 事务管理 - 洋葱模型的优雅之处 ═══════');

  // 模拟数据库客户端
  const mockDbClient = {
    began: false,
    committed: false,
    rolledBack: false,
    begin: async () => { mockDbClient.began = true; console.log('  DB: BEGIN'); },
    commit: async () => { mockDbClient.committed = true; console.log('  DB: COMMIT'); },
    rollback: async () => { mockDbClient.rolledBack = true; console.log('  DB: ROLLBACK'); },
    query: async (sql) => { console.log(`  DB: ${sql}`); return []; },
  };

  // Koa 风格：事务中间件（洋葱模型完美契合事务的 begin/commit/rollback）
  const transactionMiddleware = async (ctx, next) => {
    await mockDbClient.begin();
    try {
      ctx.db = mockDbClient;
      await next(); // 等待业务逻辑完成
      await mockDbClient.commit(); // 成功后 commit
    } catch (err) {
      await mockDbClient.rollback(); // 失败后 rollback
      throw err;
    }
  };

  // 业务逻辑
  const businessLogic = async (ctx, next) => {
    await ctx.db.query('INSERT INTO orders VALUES (...)');
    await ctx.db.query('UPDATE inventory SET stock = stock - 1');
    ctx.result = 'Order created';
  };

  const ctx = {};
  const fn = compose([transactionMiddleware, businessLogic]);
  await fn(ctx);
  
  console.log(`\n  结果: ${ctx.result}`);
  console.log(`  事务状态: began=${mockDbClient.began}, committed=${mockDbClient.committed}`);
  console.log('\n  ✓ 洋葱模型使事务管理极其优雅：');
  console.log('    BEGIN → (业务逻辑) → COMMIT');
  console.log('    BEGIN → error → ROLLBACK');
  console.log('  Express 中需要 hack res.end() 或使用复杂的 promise 链');
}

// ─── 主程序 ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   koa-compose 从零实现 + 洋葱模型演示   ║');
  console.log('╚══════════════════════════════════════════╝');

  await demo1_basicOrder();
  await demo2_timing();
  await demo3_errorHandling();
  await demo4_multipleNext();
  await demo5_nestedCompose();
  await demo6_expressComparison();

  console.log('\n═══════ 关键洞见 ═══════');
  console.log('1. koa-compose 仅 36 行代码，但实现了完整的中间件洋葱模型');
  console.log('2. await next() = 等待所有后续中间件（嵌套调用栈）完成');
  console.log('3. 错误自动向外传播，最外层 try/catch 可统一处理');
  console.log('4. 防止多次调用：index 变量确保每个中间件的 next() 只能调用一次');
  console.log('5. 洋葱模型的最佳场景：计时、事务、缓存这类需要"前后"逻辑的场景');
}

main().catch(console.error);
