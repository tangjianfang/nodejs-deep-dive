# 集成测试实战

## 1. 单元测试 vs 集成测试 vs E2E

```
                    速度      隔离      可信度
单元测试             ████████  高        低
集成测试             █████     中        中
E2E 测试             ██        低        高

策略（测试金字塔）:
  E2E    ← 少量（关键路径）
  集成   ← 中量（API 层、数据库交互）
  单元   ← 大量（业务逻辑）
```

---

## 2. supertest — HTTP 集成测试

```javascript
// npm install supertest
const request = require('supertest');
const app = require('../app'); // Express 应用

describe('POST /api/users', () => {
  it('创建用户 201', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${testToken}`)
      .send({ name: 'Alice', email: 'alice@test.com' })
      .expect(201)
      .expect('Content-Type', /json/);

    expect(res.body).toMatchObject({
      id:    expect.any(Number),
      name:  'Alice',
      email: 'alice@test.com',
    });
    expect(res.body.password).toBeUndefined(); // 不能返回密码
  });

  it('邮箱重复 409', async () => {
    await request(app).post('/api/users').send({ name: 'Bob', email: 'existing@test.com' });
    const res = await request(app)
      .post('/api/users')
      .send({ name: 'Charlie', email: 'existing@test.com' })
      .expect(409);
    expect(res.body.error).toBe('EMAIL_ALREADY_EXISTS');
  });
});
```

---

## 3. 数据库集成测试策略

### 方案 A：使用真实测试数据库

```javascript
// jest.setup.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });

beforeEach(async () => {
  // 在事务中运行测试，测试后自动回滚
  await prisma.$transaction(async (tx) => {
    // 清理测试数据
    await tx.user.deleteMany();
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
```

### 方案 B：事务回滚（推荐）

```javascript
// 每个测试使用独立事务并回滚
let tx;
beforeEach(async () => {
  tx = await prisma.$transaction(async (transaction) => transaction);
  jest.spyOn(prisma, '$transaction').mockImplementation(fn => fn(tx));
});
afterEach(async () => {
  await tx.$executeRaw`ROLLBACK`;
});
```

---

## 4. Mock HTTP 外部依赖（nock）

```javascript
// npm install nock
const nock = require('nock');

test('调用 Payment API', async () => {
  // 拦截外部 HTTP 请求
  nock('https://api.stripe.com')
    .post('/v1/charges')
    .reply(200, { id: 'ch_test123', status: 'succeeded' });

  const result = await paymentService.charge({ amount: 1000, currency: 'usd' });
  expect(result.status).toBe('succeeded');

  expect(nock.isDone()).toBe(true); // 确认请求被触发
});
```

---

## 5. 测试隔离原则

```javascript
// ❌ 糟糕：测试间共享状态
let userId;
test('创建用户', async () => {
  userId = await createUser('alice@test.com');
});
test('获取用户', async () => {
  const user = await getUser(userId); // 依赖上一个测试！
});

// ✅ 良好：每个测试独立
test('创建并获取用户', async () => {
  const userId = await createUser('alice@test.com');
  const user   = await getUser(userId);
  expect(user.email).toBe('alice@test.com');
});
```

---

## 6. 实践 Checklist

- [ ] 用 supertest 为 Express 路由编写集成测试
- [ ] 实现 beforeEach 清理测试数据
- [ ] 用 nock 拦截外部 HTTP 请求
- [ ] 配置 jest.setup.js 设置测试数据库
