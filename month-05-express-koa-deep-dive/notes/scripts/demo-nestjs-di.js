/**
 * demo-nestjs-di.js
 * 手动模拟 NestJS IoC 容器（不依赖任何外部库）
 * 演示: token解析、依赖树构建、单例、工厂、循环检测
 *
 * 运行: node demo-nestjs-di.js
 */

// ─── Metadata 存储（模拟 reflect-metadata）────────────────────────────────────────

const metadataStore = new Map();

function defineMetadata(key, value, target) {
  if (!metadataStore.has(target)) metadataStore.set(target, new Map());
  metadataStore.get(target).set(key, value);
}

function getMetadata(key, target) {
  return metadataStore.get(target)?.get(key);
}

// ─── 装饰器（模拟 NestJS 装饰器）────────────────────────────────────────────────

/**
 * @Injectable() 标记类可以被注入，声明其依赖（通过 paramtypes）
 */
function Injectable(deps = []) {
  return function(target) {
    defineMetadata('design:paramtypes', deps, target);
    defineMetadata('injectable', true, target);
    return target;
  };
}

/**
 * @Inject(token) 用于非类型 token 的注入
 */
function Inject(token) {
  return function(target, _key, index) {
    const existing = getMetadata('inject:tokens', target) || {};
    existing[index] = token;
    defineMetadata('inject:tokens', existing, target);
  };
}

// ─── IoC 容器核心 ────────────────────────────────────────────────────────────────

class IoCContainer {
  constructor() {
    this.providers = new Map();  // token → provider config
    this.instances = new Map();  // token → instance (singleton cache)
    this.resolving = new Set();  // 用于循环依赖检测
  }

  /**
   * 注册 provider
   * @param {Object|Function} provider
   */
  register(provider) {
    if (typeof provider === 'function') {
      // 简写形式：{ provide: Class, useClass: Class }
      this.providers.set(provider, { provide: provider, useClass: provider });
    } else if (provider.provide) {
      this.providers.set(provider.provide, provider);
    }
    return this;
  }

  /**
   * 解析并获取 provider 实例（核心方法）
   */
  resolve(token) {
    // 循环依赖检测
    if (this.resolving.has(token)) {
      const names = [...this.resolving].map(t => typeof t === 'function' ? t.name : String(t));
      throw new Error(`循环依赖检测: ${names.join(' → ')} → ${typeof token === 'function' ? token.name : token}`);
    }

    // 单例缓存
    if (this.instances.has(token)) {
      return this.instances.get(token);
    }

    const config = this.providers.get(token);
    if (!config) {
      throw new Error(`找不到 Provider：${typeof token === 'function' ? token.name : String(token)}`);
    }

    this.resolving.add(token);
    let instance;

    try {
      if (config.useValue !== undefined) {
        // Value Provider：直接使用值
        instance = config.useValue;
      } else if (config.useFactory) {
        // Factory Provider：调用工厂函数
        const deps = (config.inject || []).map(dep => this.resolve(dep));
        instance = config.useFactory(...deps);
      } else if (config.useClass) {
        // Class Provider：实例化类
        instance = this._instantiate(config.useClass);
      } else if (config.useExisting) {
        // Existing Provider：别名
        instance = this.resolve(config.useExisting);
      }
    } finally {
      this.resolving.delete(token);
    }

    // 缓存单例（value provider 也缓存）
    this.instances.set(token, instance);
    return instance;
  }

  /**
   * 实例化一个类，自动注入构造函数依赖
   */
  _instantiate(Class) {
    // 获取构造函数参数类型（由 @Injectable 装饰器设置）
    const paramTypes = getMetadata('design:paramtypes', Class) || [];
    // 获取 @Inject(token) 的自定义 token
    const injectTokens = getMetadata('inject:tokens', Class) || {};

    // 解析每个依赖
    const deps = paramTypes.map((paramType, index) => {
      const token = injectTokens[index] || paramType;
      console.log(`    解析依赖: ${Class.name} (参数${index}) → ${typeof token === 'function' ? token.name : String(token)}`);
      return this.resolve(token);
    });

    const instance = new Class(...deps);
    console.log(`  ✓ 实例化: ${Class.name}`);
    return instance;
  }

  /** 打印已注册的所有 providers */
  printProviders() {
    console.log('\n已注册的 Providers:');
    this.providers.forEach((config, token) => {
      const name = typeof token === 'function' ? token.name : String(token);
      const type = config.useClass ? `useClass(${config.useClass.name})` 
                : config.useValue !== undefined ? `useValue(${JSON.stringify(config.useValue).slice(0, 30)})`
                : config.useFactory ? 'useFactory'
                : config.useExisting ? `useExisting(${config.useExisting.name})` : '?';
      console.log(`  ${name} → ${type}`);
    });
    console.log('');
  }
}

// ─── 示例应用：User 模块 ──────────────────────────────────────────────────────────

// 模拟数据
const DB_CONFIG = { host: 'localhost', port: 5432, database: 'myapp' };
const CACHE_TOKEN = Symbol('CACHE');

// 1. DatabaseService（叶节点，无依赖）
const DatabaseService = Injectable([])(
  class DatabaseService {
    constructor() {
      this.config = null;
    }
    query(sql) {
      return [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }];
    }
    toString() { return 'DatabaseService'; }
  }
);

// 2. LoggerService（叶节点）
const LoggerService = Injectable([])(
  class LoggerService {
    log(level, message) {
      console.log(`    [${level.toUpperCase()}] ${message}`);
    }
    info(msg) { this.log('info', msg); }
    error(msg) { this.log('error', msg); }
  }
);

// 3. UserRepository（依赖 DatabaseService）
const UserRepository = Injectable([DatabaseService])(
  class UserRepository {
    constructor(db) {
      this.db = db;
    }
    async findAll() {
      return this.db.query('SELECT * FROM users');
    }
    async findById(id) {
      const users = this.db.query(`SELECT * FROM users WHERE id = ${id}`);
      return users[0] || null;
    }
  }
);

// 4. UserService（依赖 UserRepository + LoggerService + 自定义 token CACHE）
const UserService = Injectable([UserRepository, LoggerService])(
  class UserService {
    constructor(userRepo, logger) {
      this.userRepo = userRepo;
      this.logger = logger;
      this.cache = null; // 通过 @Inject 注入（模拟）
    }
    async getUsers() {
      this.logger.info('Getting all users');
      return this.userRepo.findAll();
    }
    async getUserById(id) {
      this.logger.info(`Getting user ${id}`);
      return this.userRepo.findById(id);
    }
  }
);

// 5. AuthService（依赖 UserService + LoggerService）
const AuthService = Injectable([UserService, LoggerService])(
  class AuthService {
    constructor(userService, logger) {
      this.userService = userService;
      this.logger = logger;
    }
    async login(id) {
      const user = await this.userService.getUserById(id);
      if (!user) {
        this.logger.error(`User ${id} not found`);
        throw new Error(`User ${id} not found`);
      }
      this.logger.info(`User ${user.name} logged in`);
      return { token: `jwt-${user.id}-${Date.now()}`, user };
    }
  }
);

// ─── 主演示 ───────────────────────────────────────────────────────────────────────

async function demo_basicDI() {
  console.log('\n═══════ Demo 1: 基础 DI 容器 ═══════');
  
  const container = new IoCContainer();
  
  // 注册 providers（顺序无关！容器自动解析依赖树）
  container
    .register(AuthService)        // 依赖 UserService, LoggerService
    .register(UserService)        // 依赖 UserRepository, LoggerService
    .register(UserRepository)     // 依赖 DatabaseService
    .register(DatabaseService)    // 无依赖
    .register(LoggerService)      // 无依赖
    .register({
      provide: 'DB_CONFIG',
      useValue: DB_CONFIG,         // Value Provider
    })
    .register({
      provide: CACHE_TOKEN,
      useFactory: (config) => {   // Factory Provider
        return new Map(); // 模拟 Redis 客户端（简单用 Map）
      },
      inject: ['DB_CONFIG'],
    });

  container.printProviders();
  
  console.log('解析 AuthService（自动解析整个依赖树）:');
  const authService = container.resolve(AuthService);
  
  console.log('\n执行 login:');
  const result = await authService.login(1);
  console.log('  登录结果:', result);
  
  console.log('\n单例验证（两次 resolve 应返回同一实例）:');
  const svc1 = container.resolve(UserService);
  const svc2 = container.resolve(UserService);
  console.log('  svc1 === svc2:', svc1 === svc2); // 应该是 true
}

async function demo_circularDependency() {
  console.log('\n═══════ Demo 2: 循环依赖检测 ═══════');
  
  const AService = Injectable([/* BService - will be set below */])(
    class AService { constructor(b) { this.b = b; } }
  );
  const BService = Injectable([AService])(
    class BService { constructor(a) { this.a = a; } }
  );
  // 设置 AService 依赖 BService（制造循环）
  defineMetadata('design:paramtypes', [BService], AService);

  const container = new IoCContainer();
  container.register(AService).register(BService);
  
  try {
    container.resolve(AService);
  } catch (err) {
    console.log('  检测到循环依赖并抛出错误:', err.message);
    console.log('  ✓ IoC 容器正确阻止了循环依赖实例化');
  }
}

async function demo_providerTypes() {
  console.log('\n═══════ Demo 3: 四种 Provider 类型 ═══════');
  
  const container = new IoCContainer();
  
  // 1. useClass
  container.register({ provide: 'Logger', useClass: LoggerService });
  
  // 2. useValue
  container.register({ provide: 'APP_NAME', useValue: 'MyApp v1.0' });
  container.register({ provide: 'MAX_RETRY', useValue: 3 });
  
  // 3. useFactory（带依赖）
  container.register({ provide: 'DB_CONFIG', useValue: DB_CONFIG });
  container.register({
    provide: 'DB_URL',
    useFactory: (config) => `postgresql://${config.host}:${config.port}/${config.database}`,
    inject: ['DB_CONFIG'],
  });
  
  // 4. useExisting（别名）
  container.register({ provide: 'AliasLogger', useExisting: 'Logger' });
  
  const appName = container.resolve('APP_NAME');
  const maxRetry = container.resolve('MAX_RETRY');
  const dbUrl = container.resolve('DB_URL');
  const logger = container.resolve('Logger');
  const aliasLogger = container.resolve('AliasLogger');
  
  console.log('  APP_NAME:', appName);
  console.log('  MAX_RETRY:', maxRetry);
  console.log('  DB_URL:', dbUrl);
  console.log('  Logger === AliasLogger:', logger === aliasLogger, '(useExisting 不创建新实例)');
}

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   NestJS IoC 容器手动模拟演示            ║');
  console.log('╚══════════════════════════════════════════╝');
  
  await demo_basicDI();
  await demo_circularDependency();
  await demo_providerTypes();
  
  console.log('\n═══════ 关键洞见 ═══════');
  console.log('1. IoC 容器本质：token → provider 的 Map + 依赖解析递归');
  console.log('2. NestJS 用 reflect-metadata 自动读取 TypeScript 类型作为 token');
  console.log('3. 单例缓存：第一次创建后存入 instances Map，后续直接返回');
  console.log('4. 循环依赖：用 resolving Set 追踪当前解析路径');
  console.log('5. 四种 Provider：useClass, useValue, useFactory, useExisting');
  console.log('6. 测试友好：替换 useClass 为 Mock 类即可注入假实现');
}

main().catch(console.error);
