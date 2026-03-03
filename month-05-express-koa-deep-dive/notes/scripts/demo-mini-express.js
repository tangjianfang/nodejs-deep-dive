/**
 * demo-mini-express.js
 * 从零实现一个 Mini Express（~150行）
 * 包含: app.use, Router, 路径参数, 错误处理
 *
 * 运行: node demo-mini-express.js
 * 测试:
 *   curl http://localhost:3000/
 *   curl http://localhost:3000/users
 *   curl http://localhost:3000/users/42
 *   curl -X POST http://localhost:3000/users -H 'Content-Type: application/json' -d '{"name":"Alice"}'
 *   curl http://localhost:3000/error
 */

const http = require('http');
const url = require('url');

// ─── Layer（路由层）─────────────────────────────────────────────────────────────

class Layer {
  constructor(method, path, handler) {
    this.method = method ? method.toUpperCase() : null; // null = 匹配所有方法
    this.path = path;
    this.handler = handler;
    this.paramNames = [];
    this.regexp = this._buildRegexp(path);
  }

  /**
   * 将路径字符串转为正则，提取参数名
   * '/users/:id/posts/:postId' → /^\/users\/([^/]+)\/posts\/([^/]+)(?:\/|$)/
   */
  _buildRegexp(path) {
    if (!path || path === '/') return /^\/(?:$|\/)/;
    
    const regexStr = '^' + 
      path
        .replace(/\//g, '\\/')           // 转义斜杠
        .replace(/:([^/]+)/g, (_, name) => {
          this.paramNames.push(name);    // 收集参数名
          return '([^\\/]+)';            // 替换为捕获组
        }) + 
      '(?:\\/|$)';
    
    return new RegExp(regexStr);
  }

  /**
   * 匹配请求路径，返回提取的参数或 null
   */
  match(reqPath) {
    const match = reqPath.match(this.regexp);
    if (!match) return null;
    
    // 将捕获组映射到参数名
    const params = {};
    this.paramNames.forEach((name, i) => {
      params[name] = decodeURIComponent(match[i + 1]);
    });
    
    return params;
  }
}

// ─── Router ────────────────────────────────────────────────────────────────────

class Router {
  constructor() {
    this.stack = []; // Layer[]
  }

  /** 注册路由 */
  route(method, path, ...handlers) {
    // 支持多个 handler（中间件链）
    for (const handler of handlers) {
      this.stack.push(new Layer(method, path, handler));
    }
    return this;
  }

  use(path, ...handlers) {
    // 如果第一个参数是函数，path 省略（匹配所有路径）
    if (typeof path === 'function') {
      handlers = [path, ...handlers];
      path = '/';
    }
    for (const handler of handlers) {
      // use() 使用前缀匹配（略有不同于精确匹配）
      const layer = new Layer(null, path, handler);
      layer.isPrefix = true; // 标记为前缀匹配
      this.stack.push(layer);
    }
    return this;
  }

  get(path, ...handlers) { return this.route('GET', path, ...handlers); }
  post(path, ...handlers) { return this.route('POST', path, ...handlers); }
  put(path, ...handlers) { return this.route('PUT', path, ...handlers); }
  delete(path, ...handlers) { return this.route('DELETE', path, ...handlers); }
  patch(path, ...handlers) { return this.route('PATCH', path, ...handlers); }

  /**
   * 核心分发逻辑
   */
  handle(req, res, done) {
    let idx = 0;
    const self = this;

    function next(err) {
      const layer = self.stack[idx++];
      if (!layer) return done(err); // 没有更多路由

      const params = matchLayer(layer, req);
      if (params === null) return next(err); // 不匹配，继续

      // 错误中间件（4个参数）vs 普通中间件
      const isErrorHandler = layer.handler.length === 4;
      if (err && !isErrorHandler) return next(err);  // 有错误，跳过普通处理器
      if (!err && isErrorHandler) return next();      // 无错误，跳过错误处理器

      // 合并路由参数
      req.params = { ...req.params, ...params };

      try {
        if (isErrorHandler) {
          layer.handler(err, req, res, next);
        } else {
          layer.handler(req, res, next);
        }
      } catch (e) {
        next(e); // 捕获同步错误
      }
    }

    next();
  }
}

function matchLayer(layer, req) {
  // 方法检查
  if (layer.method && layer.method !== req.method.toUpperCase()) return null;
  
  const reqPath = req.path || '/';
  
  if (layer.isPrefix) {
    // 前缀匹配（app.use）
    if (reqPath === layer.path || reqPath.startsWith(layer.path + '/') || layer.path === '/') {
      return {};
    }
    return null;
  }
  
  // 精确匹配
  return layer.match(reqPath);
}

// ─── Application ────────────────────────────────────────────────────────────────

class Application {
  constructor() {
    this.router = new Router();
    this.settings = {};
    
    // 代理 Router 方法到 Application
    ['use', 'get', 'post', 'put', 'delete', 'patch'].forEach(method => {
      this[method] = this.router[method].bind(this.router);
    });
  }

  /**
   * 增强 req 和 res 对象
   */
  _initRequest(req) {
    const parsed = url.parse(req.url, true);
    req.path = parsed.pathname;
    req.query = parsed.query;
    req.params = {};
    
    // 解析 body（简化版，只处理 JSON）
    return new Promise((resolve) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        const ct = req.headers['content-type'] || '';
        if (ct.includes('application/json') && body) {
          try { req.body = JSON.parse(body); } catch (_) {}
        } else if (ct.includes('urlencoded') && body) {
          req.body = Object.fromEntries(new url.URLSearchParams(body));
        }
        resolve();
      });
    });
  }

  _initResponse(res) {
    // 链式状态码
    res.status = (code) => { res.statusCode = code; return res; };
    
    // JSON 响应
    res.json = (data) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(data));
    };
    
    // 文本响应
    res.send = (body) => {
      if (typeof body === 'string') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
      }
      res.end(String(body));
    };
    
    // 重定向
    res.redirect = (code, url) => {
      if (typeof code === 'string') { url = code; code = 302; }
      res.statusCode = code;
      res.setHeader('Location', url);
      res.end();
    };
    
    return res;
  }

  /**
   * 创建 HTTP 处理函数（可传给 http.createServer）
   */
  callback() {
    return async (req, res) => {
      await this._initRequest(req);
      this._initResponse(res);
      
      this.router.handle(req, res, (err) => {
        // 全局默认错误处理
        if (err) {
          res.statusCode = err.status || err.statusCode || 500;
          res.json({ error: err.message });
        } else {
          res.statusCode = 404;
          res.json({ error: `Cannot ${req.method} ${req.path}` });
        }
      });
    };
  }

  listen(port, cb) {
    const server = http.createServer(this.callback());
    return server.listen(port, cb);
  }
}

// ─── 使用示例 ──────────────────────────────────────────────────────────────────

const app = new Application();

// 1. 全局中间件
app.use((req, res, next) => {
  const start = Date.now();
  const originalEnd = res.end.bind(res);
  res.end = (...args) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} ${res.statusCode} ${Date.now()-start}ms`);
    return originalEnd(...args);
  };
  next();
});

// 2. CORS 中间件
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).send('');
  next();
});

// 3. 根路由
app.get('/', (req, res) => {
  res.json({
    message: '欢迎使用 Mini Express!',
    routes: ['GET /', 'GET /users', 'GET /users/:id', 'POST /users', 'GET /error'],
  });
});

// 4. 使用子路由（Router）
const userRouter = new Router();

userRouter.get('/', (req, res) => {
  res.json({ users: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }] });
});

userRouter.get('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  res.json({ id, name: `User ${id}`, query: req.query });
});

userRouter.post('/', (req, res) => {
  const { name } = req.body || {};
  if (!name) {
    const err = new Error('name is required');
    err.status = 400;
    throw err;
  }
  res.status(201).json({ id: Date.now(), name, created: true });
});

// 挂载子路由
app.use('/users', (req, res, next) => {
  // 子路由前的中间件（伪装成 app.use('/users', userRouter.handle)）
  // 调整 req.path（去掉前缀）
  const prefix = '/users';
  if (req.path.startsWith(prefix)) {
    req.path = req.path.slice(prefix.length) || '/';
  }
  userRouter.handle(req, res, next);
});

// 5. 触发错误
app.get('/error', (req, res, next) => {
  const err = new Error('这是一个模拟错误！');
  err.status = 422;
  next(err);
});

// 6. 异步路由（模拟 DB 查询）
app.get('/async', async (req, res, next) => {
  try {
    await new Promise(r => setTimeout(r, 100)); // 模拟异步
    res.json({ data: 'async result', delay: '100ms' });
  } catch (err) {
    next(err);
  }
});

// 7. 错误处理中间件（4个参数，放在最后）
app.use((err, req, res, next) => {
  console.error('[Error]', err.message);
  res.status(err.status || 500).json({
    error: err.message,
    type: err.constructor.name,
  });
});

// ─── 启动 ──────────────────────────────────────────────────────────────────────

app.listen(3000, () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚀 Mini Express Server (from scratch, ~150 lines)');
  console.log('   http://localhost:3000');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n测试命令:');
  console.log('  curl http://localhost:3000/');
  console.log('  curl http://localhost:3000/users');
  console.log('  curl http://localhost:3000/users/42?verbose=true');
  console.log('  curl -X POST http://localhost:3000/users -H "Content-Type: application/json" -d \'{"name":"Charlie"}\'');
  console.log('  curl http://localhost:3000/error');
  console.log('  curl http://localhost:3000/async');
  console.log('\n核心实现要点:');
  console.log('  ✓ Layer: 路径匹配（正则 + 参数提取）');
  console.log('  ✓ Router: 中间件栈 + next() 分发逻辑');
  console.log('  ✓ 错误处理: handler.length === 4 识别错误中间件');
  console.log('  ✓ req/res 扩展: 挂载 path, query, body, json(), send()');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});
