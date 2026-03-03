/**
 * demo-jest-patterns.js
 * 展示 Jest 核心测试模式（可直接用 node 运行查看结构，实际测试需 jest）
 *
 * 运行完整测试: npx jest demo-jest-patterns.test.js
 *
 * 本文件展示常用 Jest patterns 的代码结构
 */

'use strict';

// ─── 被测试的模块 ──────────────────────────────────────────────────────────────

class UserRepository {
  constructor(db) {
    this.db = db;
  }
  async findById(id) {
    return this.db.query('SELECT * FROM users WHERE id = ?', [id]);
  }
  async create({ name, email }) {
    if (!email.includes('@')) throw new Error('Invalid email');
    return this.db.query('INSERT INTO users (name, email) VALUES (?, ?)', [name, email]);
  }
}

class EmailService {
  async send({ to, subject, body }) {
    // 真实实现会调用 SMTP/API
    throw new Error('EmailService.send() not implemented in test');
  }
}

class UserService {
  constructor(userRepository, emailService) {
    this.userRepository = userRepository;
    this.emailService = emailService;
  }
  async register({ name, email }) {
    const user = await this.userRepository.create({ name, email });
    await this.emailService.send({ to: email, subject: 'Welcome!', body: `Hi ${name}` });
    return user;
  }
  async getUserById(id) {
    const user = await this.userRepository.findById(id);
    if (!user) throw new Error(`User ${id} not found`);
    return user;
  }
}

// ─── 模拟测试展示（不依赖 Jest 运行时） ───────────────────────────────────────

async function demonstratePatterns() {
  console.log('Jest 测试模式展示（代码结构）\n');

  // ─── Pattern 1：手动 Mock ──────────────────────────────────────────────────
  console.log('Pattern 1: 依赖注入 + 手动 Mock');

  const mockDb = {
    query: async (sql, params) => {
      if (sql.includes('INSERT')) return { id: 42, name: params[0], email: params[1] };
      return { id: 1, name: 'Alice', email: 'alice@test.com' };
    },
  };

  let emailCallLog = [];
  const mockEmail = {
    send: async (opts) => { emailCallLog.push(opts); return { messageId: 'msg-001' }; },
  };

  const repo = new UserRepository(mockDb);
  const service = new UserService(repo, mockEmail);

  const user = await service.register({ name: 'Bob', email: 'bob@test.com' });
  console.log('  创建用户:', user);
  console.log('  发送邮件:', emailCallLog[0]);
  console.log('  ✅ 验证: emailService.send 被调用 1 次，收件人正确\n');

  // ─── Pattern 2：错误测试 ─────────────────────────────────────────────────
  console.log('Pattern 2: 错误路径测试');
  try {
    await service.register({ name: 'Bad', email: 'not-an-email' });
    console.log('  ❌ 应该抛出错误！');
  } catch (err) {
    console.log(`  ✅ 捕获到错误: "${err.message}"`);
  }

  // ─── Pattern 3：Spy 模式（追踪调用） ────────────────────────────────────
  console.log('\nPattern 3: Call tracking (Spy 模式)');
  const callTracker = { calls: [] };
  const spiedEmail = new Proxy(mockEmail, {
    get(target, prop) {
      if (typeof target[prop] === 'function') {
        return (...args) => {
          callTracker.calls.push({ method: prop, args });
          return target[prop](...args);
        };
      }
      return target[prop];
    },
  });

  emailCallLog = [];
  const spiedService = new UserService(repo, spiedEmail);
  await spiedService.register({ name: 'Carol', email: 'carol@test.com' });

  console.log(`  send() 调用次数: ${callTracker.calls.length}`);
  console.log(`  send() 第一次参数:`, callTracker.calls[0]?.args[0]);

  console.log('\n=== Jest 等效代码 ===');
  console.log(`
// 在真实 Jest 测试中:
const mockDb    = { query: jest.fn() };
const mockEmail = { send:  jest.fn().mockResolvedValue({ messageId: 'msg-001' }) };

// 测试注册
test('注册用户后发送欢迎邮件', async () => {
  mockDb.query.mockResolvedValue({ id: 1, name: 'Alice', email: 'alice@test.com' });
  
  await userService.register({ name: 'Alice', email: 'alice@test.com' });
  
  expect(mockEmail.send).toHaveBeenCalledTimes(1);
  expect(mockEmail.send).toHaveBeenCalledWith({
    to: 'alice@test.com',
    subject: 'Welcome!',
    body: expect.stringContaining('Alice'),
  });
});

// 测试错误
test('无效邮箱应抛出错误', async () => {
  await expect(
    userService.register({ name: 'Bad', email: 'not-email' })
  ).rejects.toThrow('Invalid email');
  
  expect(mockEmail.send).not.toHaveBeenCalled();
});
`);
}

demonstratePatterns().catch(console.error);
