/**
 * demo-n-plus-one.js
 * 演示 N+1 查询问题及 DataLoader 批处理解决方案
 * 无需数据库：使用内存模拟数据
 */

'use strict';

// ─── 模拟数据 ─────────────────────────────────────────────────────────────────

const users = [
  { id: 1, name: 'Alice', departmentId: 10 },
  { id: 2, name: 'Bob',   departmentId: 10 },
  { id: 3, name: 'Carol', departmentId: 20 },
  { id: 4, name: 'Dave',  departmentId: 20 },
  { id: 5, name: 'Eve',   departmentId: 10 },
];

const departments = [
  { id: 10, name: 'Engineering' },
  { id: 20, name: 'Marketing'   },
];

const posts = [
  { id: 1, userId: 1, title: 'Post A by Alice' },
  { id: 2, userId: 1, title: 'Post B by Alice' },
  { id: 3, userId: 2, title: 'Post C by Bob'   },
  { id: 4, userId: 3, title: 'Post D by Carol' },
];

// 模拟异步数据库查询（带延迟和查询日志）
let queryCount = 0;

function resetQueryCount() { queryCount = 0; }

async function findAllUsers() {
  queryCount++;
  console.log(`  [SQL] SELECT * FROM users`);
  await sleep(5);
  return users;
}

async function findDepartmentById(id) {
  queryCount++;
  console.log(`  [SQL] SELECT * FROM departments WHERE id = ${id}`);
  await sleep(5);
  return departments.find(d => d.id === id) || null;
}

async function findDepartmentsByIds(ids) {
  queryCount++;
  console.log(`  [SQL] SELECT * FROM departments WHERE id IN (${ids.join(', ')})`);
  await sleep(5);
  return departments.filter(d => ids.includes(d.id));
}

async function findPostsByUserId(userId) {
  queryCount++;
  console.log(`  [SQL] SELECT * FROM posts WHERE userId = ${userId}`);
  await sleep(5);
  return posts.filter(p => p.userId === userId);
}

async function findPostsByUserIds(userIds) {
  queryCount++;
  console.log(`  [SQL] SELECT * FROM posts WHERE userId IN (${userIds.join(', ')})`);
  await sleep(5);
  return posts.filter(p => userIds.includes(p.userId));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── 问题演示：N+1 ─────────────────────────────────────────────────────────────

async function nPlusOneProblem() {
  console.log('\n========================================');
  console.log('❌ N+1 问题演示');
  console.log('========================================');

  const start = Date.now();
  resetQueryCount();

  // 1 次查询：获取所有用户
  const allUsers = await findAllUsers();

  // N 次查询：对每个用户分别查询部门
  const results = [];
  for (const user of allUsers) {
    const dept = await findDepartmentById(user.departmentId); // N 次！
    results.push({ user: user.name, department: dept?.name });
  }

  console.log('\n结果:');
  results.forEach(r => console.log(`  ${r.user} → ${r.department}`));
  console.log(`\n⚠️  总查询次数: ${queryCount} (1 + ${allUsers.length} = N+1 问题)`);
  console.log(`⏱️  耗时: ${Date.now() - start}ms`);
}

// ─── 解决方案 1：JOIN 查询（手动批处理） ─────────────────────────────────────

async function solveWithBatchQuery() {
  console.log('\n========================================');
  console.log('✅ 解决方案 1：批量查询（WHERE IN）');
  console.log('========================================');

  const start = Date.now();
  resetQueryCount();

  const allUsers = await findAllUsers();

  // 收集所有需要的 departmentId（去重）
  const deptIds = [...new Set(allUsers.map(u => u.departmentId))];

  // 1 次查询获取所有需要的部门
  const depts = await findDepartmentsByIds(deptIds);
  const deptMap = new Map(depts.map(d => [d.id, d]));

  // 内存中 join
  const results = allUsers.map(user => ({
    user: user.name,
    department: deptMap.get(user.departmentId)?.name,
  }));

  console.log('\n结果:');
  results.forEach(r => console.log(`  ${r.user} → ${r.department}`));
  console.log(`\n✅ 总查询次数: ${queryCount} (大幅减少!)`);
  console.log(`⏱️  耗时: ${Date.now() - start}ms`);
}

// ─── 解决方案 2：DataLoader 模式（批处理 + 缓存） ─────────────────────────────

class DataLoader {
  /**
   * @param {Function} batchFn - (keys: K[]) => Promise<V[]>，返回数组顺序须与 keys 对应
   * @param {Object} options
   */
  constructor(batchFn, options = {}) {
    this._batchFn = batchFn;
    this._maxBatchSize = options.maxBatchSize || Infinity;
    this._cache = options.cache !== false ? new Map() : null;
    this._queue = [];   // 待批处理的 { key, resolve, reject }
    this._scheduled = false;
  }

  load(key) {
    // 缓存命中
    if (this._cache && this._cache.has(key)) {
      return this._cache.get(key);
    }

    const promise = new Promise((resolve, reject) => {
      this._queue.push({ key, resolve, reject });
    });

    if (this._cache) {
      this._cache.set(key, promise);
    }

    // 调度批处理（在当前 tick 结束后执行）
    if (!this._scheduled) {
      this._scheduled = true;
      process.nextTick(() => this._dispatch());
    }

    return promise;
  }

  async _dispatch() {
    this._scheduled = false;
    const batch = this._queue.splice(0, this._maxBatchSize);
    if (batch.length === 0) return;

    const keys = batch.map(item => item.key);
    console.log(`  [DataLoader] 批处理 ${keys.length} 个 key: [${keys.join(', ')}]`);

    try {
      const values = await this._batchFn(keys);
      batch.forEach((item, i) => item.resolve(values[i]));
    } catch (err) {
      batch.forEach(item => item.reject(err));
    }
  }

  clearCache() {
    this._cache?.clear();
  }
}

async function solveWithDataLoader() {
  console.log('\n========================================');
  console.log('✅ 解决方案 2：DataLoader 模式');
  console.log('========================================');

  const start = Date.now();
  resetQueryCount();

  // 创建 DepartmentLoader（批量加载 + 缓存）
  const departmentLoader = new DataLoader(async (ids) => {
    const depts = await findDepartmentsByIds(ids);
    const deptMap = new Map(depts.map(d => [d.id, d]));
    // 必须按输入 ids 顺序返回（没找到返回 null）
    return ids.map(id => deptMap.get(id) || null);
  });

  const allUsers = await findAllUsers();

  // 并发加载所有用户的部门（DataLoader 会自动批处理）
  const results = await Promise.all(
    allUsers.map(async user => {
      const dept = await departmentLoader.load(user.departmentId);
      return { user: user.name, department: dept?.name };
    })
  );

  console.log('\n结果:');
  results.forEach(r => console.log(`  ${r.user} → ${r.department}`));
  console.log(`\n✅ 总查询次数: ${queryCount}`);
  console.log(`⏱️  耗时: ${Date.now() - start}ms`);

  // ─── 验证缓存效果 ───────────────────────────────────────────────────────────
  console.log('\n--- 第二次 load 同样的 key（缓存命中）---');
  const aliceDept = await departmentLoader.load(1); // 不存在的 userId，演示 null
  const dept10 = await departmentLoader.load(10);
  console.log(`  dept 10 (缓存): ${dept10?.name}`);
  console.log(`  总查询次数（第二次 load 不增加）: ${queryCount}`);
}

// ─── 进阶：多层 DataLoader（用户 + 文章） ─────────────────────────────────────

async function multilevelDataLoader() {
  console.log('\n========================================');
  console.log('✅ 进阶：多层 DataLoader (用户 + 文章)');
  console.log('========================================');

  resetQueryCount();

  const postsByUserLoader = new DataLoader(async (userIds) => {
    const posts = await findPostsByUserIds(userIds);
    // 按 userId 分组
    const grouped = new Map(userIds.map(id => [id, []]));
    posts.forEach(p => grouped.get(p.userId)?.push(p));
    return userIds.map(id => grouped.get(id) || []);
  });

  const departmentLoader = new DataLoader(async (ids) => {
    const depts = await findDepartmentsByIds(ids);
    const map = new Map(depts.map(d => [d.id, d]));
    return ids.map(id => map.get(id) || null);
  });

  const allUsers = await findAllUsers();

  // 并发加载每个用户的部门和文章
  const results = await Promise.all(
    allUsers.map(async user => {
      const [dept, posts] = await Promise.all([
        departmentLoader.load(user.departmentId),
        postsByUserLoader.load(user.id),
      ]);
      return { user: user.name, dept: dept?.name, postCount: posts.length };
    })
  );

  console.log('\n结果:');
  results.forEach(r =>
    console.log(`  ${r.user} (${r.dept}): ${r.postCount} 篇文章`)
  );
  console.log(`\n✅ 总查询次数: ${queryCount} (用户1 + 部门1 + 文章1 = 3 次!)`);
}

// ─── 主程序 ────────────────────────────────────────────────────────────────────

async function main() {
  await nPlusOneProblem();
  await solveWithBatchQuery();
  await solveWithDataLoader();
  await multilevelDataLoader();

  console.log('\n========================================');
  console.log('📊 总结');
  console.log('========================================');
  console.log('N+1 问题      → 5 users: 6 queries  (1 + N)');
  console.log('批量查询      → 5 users: 2 queries  (固定)');
  console.log('DataLoader    → 5 users: 2 queries  (批处理 + 缓存)');
  console.log('多层 DL       → 5 users: 3 queries  (自动批处理)');
}

main().catch(console.error);
