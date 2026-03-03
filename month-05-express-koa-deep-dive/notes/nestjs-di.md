# NestJS 依赖注入与 IoC 容器深度解析

## 1. 控制反转 (IoC) 原理

**传统方式（手动管理依赖）:**
```javascript
class UserController {
  constructor() {
    // ❌ 强耦合：UserController 直接创建依赖
    this.userService = new UserService(new UserRepository(new Database()));
  }
}
```

**IoC 容器方式（依赖注入）:**
```typescript
@Controller('/users')
class UserController {
  constructor(private userService: UserService) {
    // ✅ 依赖由框架注入，UserController 不知道如何创建 UserService
  }
}
// NestJS 自动：分析依赖树 → 创建实例 → 注入
```

**反转了什么？** 控制权从"应用代码创建依赖"反转为"框架创建并注入依赖"。

---

## 2. NestJS 核心装饰器

```typescript
// @Module: 声明一个模块（NestJS 的基本组织单元）
@Module({
  imports: [TypeOrmModule, JwtModule],   // 导入其他模块
  controllers: [UserController],          // 处理 HTTP 请求的控制器
  providers: [UserService, UserRepository], // 可注入的服务
  exports: [UserService],                 // 导出给其他模块使用
})
export class UserModule {}

// @Injectable: 标记类可以被注入（必须有此装饰器）
@Injectable()
class UserService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    private jwtService: JwtService,        // 从其他模块导入
    @Inject('CONFIG') private config: Config, // 注入自定义 token
  ) {}
}

// @Controller: 标记为控制器，绑定路由前缀
@Controller('users')
class UserController {
  constructor(private readonly userService: UserService) {}
  
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.userService.findById(+id);
  }
}
```

---

## 3. IoC 容器工作原理

NestJS 使用 `reflect-metadata` 读取 TypeScript 的类型信息：

```typescript
// TypeScript 编译器将类型信息存储为 metadata（需要 emitDecoratorMetadata: true）
@Injectable()
class UserService {
  constructor(private repo: UserRepository) {}
  // TypeScript 编译后：
  // Reflect.defineMetadata('design:paramtypes', [UserRepository], UserService)
}

// NestJS 容器读取这些 metadata 来解析依赖
const paramTypes = Reflect.getMetadata('design:paramtypes', UserService);
// → [UserRepository]
// 然后递归解析 UserRepository 的依赖，直到无依赖为止
```

### 容器解析过程（简化）

```
1. 扫描 @Module → 收集所有 providers
2. 对每个 provider 读取 reflect-metadata:
   - design:paramtypes → 构造函数参数类型
3. 构建依赖图（DAG，有向无环图）
4. 拓扑排序，从叶节点开始实例化
5. 实例化时注入已创建的依赖
6. 缓存实例（scope 决定生命周期）

示例依赖图：
  UserController
       │
       ▼
  UserService ──→ UserRepository ──→ DataSource
       │
       ▼
  JwtService ──→ JwtConfig
```

---

## 4. Provider 类型

### Class Provider（最常用）
```typescript
@Module({
  providers: [
    UserService, // 简写形式，等价于下面的完整写法
    { provide: UserService, useClass: UserService },
  ]
})
```

### Value Provider
```typescript
@Module({
  providers: [
    {
      provide: 'DATABASE_CONFIG',
      useValue: {
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT),
      }
    },
    {
      provide: APP_GUARD,  // NestJS 内置 token
      useValue: new ThrottlerGuard(),
    }
  ]
})

// 注入
constructor(@Inject('DATABASE_CONFIG') private config: DatabaseConfig) {}
```

### Factory Provider
```typescript
@Module({
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: async (config: ConfigService) => {
        const client = new Redis({
          host: config.get('REDIS_HOST'),
          port: config.get('REDIS_PORT'),
        });
        await client.ping(); // 验证连接
        return client;
      },
      inject: [ConfigService], // 声明工厂函数的依赖
    }
  ]
})

// 注入
constructor(@Inject('REDIS_CLIENT') private redis: Redis) {}
```

### Existing Provider（别名）
```typescript
@Module({
  providers: [
    RealService,
    { provide: 'ALIAS', useExisting: RealService }, // 不创建新实例
  ]
})
```

---

## 5. Provider 作用域 (Scope)

```typescript
// 1. Singleton（默认）：整个应用共享一个实例
@Injectable() // 等价于 @Injectable({ scope: Scope.DEFAULT })
class DatabaseService {}

// 2. Request：每个 HTTP 请求创建新实例（注意性能影响！）
@Injectable({ scope: Scope.REQUEST })
class RequestContextService {
  // 可以存储 request-specific 数据
}

// 3. Transient：每次注入都创建新实例
@Injectable({ scope: Scope.TRANSIENT })
class LoggerService {}
```

> ⚠️ **作用域冒泡**：如果一个 SINGLETON 依赖一个 REQUEST scoped provider，
> 该 SINGLETON 会自动升级为 REQUEST scope（避免 stale 数据）

---

## 6. 自定义 Provider Token

```typescript
// 使用 Symbol（推荐，避免字符串命名冲突）
export const LOGGER_TOKEN = Symbol('Logger');
export const IUserRepository = Symbol('IUserRepository');

// 接口（TypeScript interface 编译后消失，不能直接注入！需要 Symbol/token）
export interface IUserRepository {
  findById(id: number): Promise<User | null>;
}

// 实现
@Injectable()
class PrismaUserRepository implements IUserRepository {
  async findById(id: number) { /* ... */ }
}

// 生产环境 provider
{ provide: IUserRepository, useClass: PrismaUserRepository }
// 测试环境 provider（Mock）
{ provide: IUserRepository, useClass: MockUserRepository }

// 注入
constructor(@Inject(IUserRepository) private userRepo: IUserRepository) {}
```

---

## 7. 模块动态配置

```typescript
// forRoot/forFeature 模式（TypeORM、JWT 等都用这个模式）
@Module({})
export class HttpClientModule {
  static forRoot(config: HttpClientConfig): DynamicModule {
    return {
      module: HttpClientModule,
      providers: [
        { provide: HTTP_CLIENT_CONFIG, useValue: config },
        HttpClientService,
      ],
      exports: [HttpClientService],
    };
  }
  
  // forRootAsync: 配置来自异步工厂（常见于依赖 ConfigService）
  static forRootAsync(options: AsyncOptions): DynamicModule {
    return {
      module: HttpClientModule,
      imports: options.imports || [],
      providers: [
        {
          provide: HTTP_CLIENT_CONFIG,
          useFactory: options.useFactory,
          inject: options.inject || [],
        },
        HttpClientService,
      ],
      exports: [HttpClientService],
    };
  }
}

// 使用
@Module({
  imports: [
    HttpClientModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        baseUrl: config.get('API_URL'),
        timeout: 5000,
      }),
      inject: [ConfigService],
    }),
  ]
})
```

---

## 8. 循环依赖处理

```typescript
// 问题：A 依赖 B，B 依赖 A → 无法解析！
@Injectable() class UserService {
  constructor(private authService: AuthService) {} // AuthService 依赖 UserService
}
@Injectable() class AuthService {
  constructor(private userService: UserService) {} // 循环！
}

// 解决方案1: 前向引用 forwardRef（处理类级循环）
@Injectable() class UserService {
  constructor(
    @Inject(forwardRef(() => AuthService)) // 延迟解析
    private authService: AuthService,
  ) {}
}

// 解决方案2（更好）: 提取共同逻辑到第三个服务（拆分职责）
@Injectable() class UserHelperService {} // 被 UserService 和 AuthService 共同依赖
// UserService 和 AuthService 都依赖 UserHelperService，不再互相依赖

// 解决方案3: 模块级循环依赖
@Module({
  imports: [forwardRef(() => AuthModule)],
})
export class UserModule {}
```

> 💡 循环依赖通常是架构设计问题的信号，优先考虑重构！

---

## 9. NestJS vs Express DI 比较

| 维度 | Express（手动）| NestJS（IoC）|
|------|--------------|-------------|
| 依赖管理 | `require` + 手动传参 | 自动注入 |
| 测试 | 需要在测试中手动 mock | DI 容器替换 provider 即可 |
| 可见性 | 代码散乱 | 声明式，清晰 |
| 启动时间 | 快 | 慢一些（容器初始化）|
| 类型安全 | ❌ | ✅（TypeScript 配合）|
| 学习曲线 | 低 | 高（装饰器、元编程）|
| 适用项目规模 | 小-中 | 中-大 |

---

## 10. 练习 Checklist

- [ ] 运行 demo-nestjs-di.js，理解 IoC 容器的 token 解析过程
- [ ] 创建一个有 Module → Controller → Service → Repository 4 层的 NestJS 应用
- [ ] 实现一个 Factory Provider（异步初始化 Redis 连接）
- [ ] 用 useClass 替换 provider 实现实现，模拟测试中的 Mock 注入
- [ ] 刻意制造循环依赖，观察错误信息，用 forwardRef 解决
