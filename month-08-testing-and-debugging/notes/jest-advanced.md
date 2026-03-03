# Jest 高级用法深度解析

## 1. Mock、Spy、Stub 区别

```
Stub  → 替换实现，不记录调用（jest.fn() 返回固定值）
Spy   → 监听真实实现的调用（jest.spyOn()）
Mock  → 替换整个模块（jest.mock()）

选择原则:
  - 测试"有没有被调用" → Spy
  - 替换外部依赖（HTTP、数据库）→ Mock
  - 控制返回值 → Stub/Mock
```

---

## 2. jest.mock() — 模块 Mock

```javascript
// emailService.js
module.exports = { send: async (to, subject) => { /* 真实发邮件 */ } };

// userService.test.js
jest.mock('./emailService'); // 自动 mock，所有方法变为 jest.fn()
const emailService = require('./emailService');

test('注册用户后发送欢迎邮件', async () => {
  emailService.send.mockResolvedValue({ messageId: 'msg-001' });
  
  await userService.register({ email: 'alice@example.com' });
  
  expect(emailService.send).toHaveBeenCalledTimes(1);
  expect(emailService.send).toHaveBeenCalledWith(
    'alice@example.com',
    expect.stringContaining('Welcome')
  );
});
```

---

## 3. jest.spyOn() — 间谍

```javascript
test('使用 spyOn 监听方法调用', async () => {
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  
  await service.doSomethingThatMightFail();
  
  expect(spy).not.toHaveBeenCalled(); // 确认没有错误日志
  spy.mockRestore(); // 恢复原始实现
});

// 监听模块方法
const db = require('./db');
const querySpy = jest.spyOn(db, 'query').mockResolvedValue([{ id: 1 }]);
await repository.findById(1);
expect(querySpy).toHaveBeenCalledWith('SELECT * FROM users WHERE id = ?', [1]);
```

---

## 4. 假计时器（Fake Timers）

```javascript
describe('重试机制', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('5秒后重试', async () => {
    const mockFn = jest.fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ data: 'ok' });
    
    const promise = retryWithBackoff(mockFn, 5000);
    
    expect(mockFn).toHaveBeenCalledTimes(1);
    
    // 快进 5 秒
    await jest.advanceTimersByTimeAsync(5000);
    
    const result = await promise;
    expect(result).toEqual({ data: 'ok' });
    expect(mockFn).toHaveBeenCalledTimes(2);
  });
});
```

---

## 5. 测试异步代码

```javascript
// ✅ 正确：async/await
test('异步操作', async () => {
  const result = await fetchUserById(1);
  expect(result.name).toBe('Alice');
});

// ✅ 正确：Promise
test('Promise', () => {
  return fetchUserById(1).then(user => {
    expect(user.name).toBe('Alice');
  });
});

// ❌ 错误：忘记 return/await（测试永远通过，不管结果）
test('危险！', () => {
  fetchUserById(1).then(user => {
    expect(user.name).toBe('Alice'); // 这个 assertion 可能不会执行！
  });
});

// 验证 Promise reject
test('应该抛出错误', async () => {
  await expect(fetchUserById(-1)).rejects.toThrow('User not found');
});
```

---

## 6. 快照测试

```javascript
test('API 响应格式不变', async () => {
  const response = await apiClient.get('/users/1');
  expect(response.data).toMatchSnapshot();
  // 第一次运行创建快照，后续比对
});

// 内联快照（不创建文件）
test('内联快照', () => {
  expect(formatUser({ id: 1, name: 'Alice' }))
    .toMatchInlineSnapshot(`
      Object {
        "displayName": "Alice",
        "id": 1,
      }
    `);
});
```

---

## 7. 覆盖率配置

```json
// jest.config.js
module.exports = {
  collectCoverageFrom: ['src/**/*.js'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  coverageReporters: ['text', 'lcov', 'html'],
};
```

---

## 8. 实践 Checklist

- [ ] 用 `jest.mock()` mock 数据库模块，测试 Service 层
- [ ] 用 `jest.spyOn()` 验证日志记录
- [ ] 用 fake timers 测试 setTimeout/setInterval 逻辑
- [ ] 为 API handler 编写快照测试
- [ ] 运行 `jest --coverage`，将覆盖率提升到 80%+
