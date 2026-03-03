/**
 * demo-mini-http-server.js
 * 使用 net 模块从零实现一个 HTTP/1.1 服务器
 * 目的: 理解 Node.js http 模块底层的 TCP 处理和 HTTP 解析
 * 
 * 运行: node demo-mini-http-server.js
 * 测试: curl http://localhost:7070/
 *       curl -X POST http://localhost:7070/api/echo -d '{"msg":"hello"}' -H 'Content-Type: application/json'
 *       curl http://localhost:7070/favicon.ico
 */

const net = require('net');
const fs = require('fs');
const path = require('path');

// ─── HTTP 请求解析器 ───────────────────────────────────────────────────────────

/**
 * 解析 HTTP 请求报文
 * @param {string} raw - 原始 HTTP 请求字符串
 * @returns {{ method, url, version, headers, body }}
 */
function parseRequest(raw) {
  // 分离 header 和 body（以 \r\n\r\n 为界）
  const headerBodySep = raw.indexOf('\r\n\r\n');
  if (headerBodySep === -1) return null;

  const headerSection = raw.slice(0, headerBodySep);
  const body = raw.slice(headerBodySep + 4); // +4 跳过 \r\n\r\n

  const lines = headerSection.split('\r\n');
  
  // 解析请求行: "GET /path HTTP/1.1"
  const [requestLine, ...headerLines] = lines;
  const [method, url, version] = requestLine.split(' ');

  // 解析请求头
  const headers = {};
  for (const line of headerLines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const name = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();
    headers[name] = value;
  }

  return { method, url, version, headers, body };
}

// ─── HTTP 响应构建器 ────────────────────────────────────────────────────────────

const STATUS_MESSAGES = {
  200: 'OK',
  201: 'Created',
  204: 'No Content',
  400: 'Bad Request',
  404: 'Not Found',
  405: 'Method Not Allowed',
  500: 'Internal Server Error',
};

/**
 * 构建 HTTP 响应报文
 */
function buildResponse({ status = 200, headers = {}, body = '' }) {
  const statusMsg = STATUS_MESSAGES[status] || 'Unknown';
  const bodyBuffer = typeof body === 'string' ? Buffer.from(body, 'utf8') : body;
  
  // 默认头部
  const defaultHeaders = {
    'Content-Length': bodyBuffer.length,
    'Connection': 'close',
    'Date': new Date().toUTCString(),
    'Server': 'MiniHTTP/1.0',
  };
  
  const allHeaders = { ...defaultHeaders, ...headers };
  
  // 构建头部行
  let responseHead = `HTTP/1.1 ${status} ${statusMsg}\r\n`;
  for (const [key, val] of Object.entries(allHeaders)) {
    responseHead += `${key}: ${val}\r\n`;
  }
  responseHead += '\r\n'; // 空行分隔 header 和 body

  return Buffer.concat([Buffer.from(responseHead), bodyBuffer]);
}

// ─── 路由系统 ──────────────────────────────────────────────────────────────────

class Router {
  constructor() {
    this.routes = []; // [{ method, pattern, handler }]
  }

  /**
   * 注册路由
   * @param {string} method 
   * @param {string|RegExp} pattern 
   * @param {Function} handler 
   */
  on(method, pattern, handler) {
    this.routes.push({ method: method.toUpperCase(), pattern, handler });
  }

  get(pattern, handler) { this.on('GET', pattern, handler); }
  post(pattern, handler) { this.on('POST', pattern, handler); }

  /**
   * 匹配路由，提取路径参数
   * 支持 /users/:id 形式
   */
  match(method, url) {
    // 去掉查询字符串
    const pathname = url.split('?')[0];
    const querystring = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
    
    // 解析查询参数
    const query = {};
    for (const pair of querystring.split('&')) {
      if (!pair) continue;
      const [k, v] = pair.split('=');
      query[decodeURIComponent(k)] = decodeURIComponent(v || '');
    }

    for (const route of this.routes) {
      if (route.method !== method.toUpperCase()) continue;
      
      if (typeof route.pattern === 'string') {
        // 将 /users/:id 转为正则
        const regexStr = '^' + route.pattern.replace(/:([^/]+)/g, '(?<$1>[^/]+)') + '$';
        const regex = new RegExp(regexStr);
        const match = pathname.match(regex);
        if (match) {
          return { handler: route.handler, params: match.groups || {}, query };
        }
      } else if (route.pattern instanceof RegExp) {
        const match = pathname.match(route.pattern);
        if (match) {
          return { handler: route.handler, params: match.groups || {}, query };
        }
      }
    }
    return null;
  }
}

// ─── 静态文件服务 ──────────────────────────────────────────────────────────────

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain',
};

function serveStaticFile(filePath, sendResponse) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  
  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        sendResponse(buildResponse({ status: 404, body: '404 Not Found' }));
      } else {
        sendResponse(buildResponse({ status: 500, body: '500 Internal Server Error' }));
      }
      return;
    }
    sendResponse(buildResponse({
      status: 200,
      headers: { 'Content-Type': contentType },
      body: data,
    }));
  });
}

// ─── 应用逻辑 ──────────────────────────────────────────────────────────────────

const router = new Router();

// GET /
router.get('/', (req, res) => {
  res({
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: `
      <!DOCTYPE html>
      <html>
        <head><title>MiniHTTP Server</title></head>
        <body>
          <h1>🚀 MiniHTTP Server</h1>
          <p>Built with Node.js <code>net</code> module (no http module!)</p>
          <ul>
            <li><a href="/api/hello">GET /api/hello</a></li>
            <li><a href="/api/users/42">GET /api/users/:id</a></li>
            <li><code>POST /api/echo</code></li>
          </ul>
        </body>
      </html>
    `,
  });
});

// GET /api/hello
router.get('/api/hello', (req, res) => {
  res({
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Hello from MiniHTTP!', time: new Date().toISOString() }),
  });
});

// GET /api/users/:id — 路径参数示例
router.get('/api/users/:id', (req, res) => {
  const { id } = req.params;
  res({
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user: { id: parseInt(id), name: `User ${id}` } }),
  });
});

// POST /api/echo — 读取 body 并回显
router.post('/api/echo', (req, res) => {
  const contentType = req.headers['content-type'] || 'text/plain';
  res({
    status: 200,
    headers: { 'Content-Type': contentType },
    body: req.body,
  });
});

// ─── TCP 服务器核心 ────────────────────────────────────────────────────────────

let requestCount = 0;

const server = net.createServer((socket) => {
  const clientAddr = `${socket.remoteAddress}:${socket.remotePort}`;
  requestCount++;
  const reqId = requestCount;
  
  let rawData = '';

  socket.on('data', (chunk) => {
    rawData += chunk.toString('binary'); // 用 binary 保留原始字节

    // 检查是否接收完整 headers（通过 \r\n\r\n 判断）
    if (rawData.includes('\r\n\r\n')) {
      // 粗略判断是否接收完整 body
      const headerEnd = rawData.indexOf('\r\n\r\n');
      const headerStr = rawData.slice(0, headerEnd);
      const headerLines = headerStr.split('\r\n');
      
      let contentLength = 0;
      for (const line of headerLines) {
        if (line.toLowerCase().startsWith('content-length:')) {
          contentLength = parseInt(line.split(':')[1].trim());
        }
      }
      
      const bodyReceived = rawData.slice(headerEnd + 4).length;
      if (bodyReceived < contentLength) return; // 还没收完 body
      
      handleRequest(rawData, socket, reqId, clientAddr);
    }
  });

  socket.on('error', (err) => {
    if (err.code !== 'ECONNRESET') {
      console.error(`[Socket Error] ${clientAddr}: ${err.message}`);
    }
  });

  socket.on('end', () => {
    // 客户端断开连接
  });
});

function handleRequest(rawData, socket, reqId, clientAddr) {
  const req = parseRequest(rawData);
  
  if (!req) {
    socket.write(buildResponse({ status: 400, body: 'Bad Request: Cannot parse HTTP message' }));
    socket.end();
    return;
  }

  console.log(`[#${reqId}] ${clientAddr} → ${req.method} ${req.url}`);

  // 定义 sendResponse 函数
  const sendResponse = (buffer) => {
    socket.write(buffer);
    socket.end();
    const statusMatch = buffer.toString().match(/HTTP\/1\.1 (\d+)/);
    console.log(`[#${reqId}] ← ${statusMatch?.[1] || '?'}`);
  };

  // 尝试路由匹配
  const matched = router.match(req.method, req.url);
  
  if (matched) {
    // 将匹配结果附加到 req
    const enrichedReq = { ...req, params: matched.params, query: matched.query };
    
    // handler(req, res) 其中 res 是发送响应的函数
    matched.handler(enrichedReq, (responseOptions) => {
      sendResponse(buildResponse(responseOptions));
    });
  } else if (req.method === 'GET') {
    // 尝试静态文件
    const safePath = path.join(__dirname, 'public', req.url.split('?')[0]);
    if (safePath.startsWith(path.join(__dirname, 'public'))) {
      serveStaticFile(safePath, sendResponse);
    } else {
      sendResponse(buildResponse({ status: 403, body: '403 Forbidden' }));
    }
  } else {
    sendResponse(buildResponse({ status: 404, body: `Cannot ${req.method} ${req.url}` }));
  }
}

// ─── 启动服务器 ────────────────────────────────────────────────────────────────

const PORT = 7070;
server.listen(PORT, '0.0.0.0', () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚀 MiniHTTP Server (built with net module, no http!)');
  console.log(`   http://localhost:${PORT}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Available routes:');
  console.log(`  GET  http://localhost:${PORT}/`);
  console.log(`  GET  http://localhost:${PORT}/api/hello`);
  console.log(`  GET  http://localhost:${PORT}/api/users/42`);
  console.log(`  POST http://localhost:${PORT}/api/echo`);
  console.log('');
  console.log('Test with curl:');
  console.log(`  curl http://localhost:${PORT}/api/hello`);
  console.log(`  curl http://localhost:${PORT}/api/users/99`);
  console.log(`  curl -X POST http://localhost:${PORT}/api/echo -d '{"hello":"world"}' -H 'Content-Type: application/json'`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n📝 http 模块内部也是这样工作的：');
  console.log('   net.Server → socket.on("data") → llhttp 解析 → IncomingMessage/ServerResponse');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`端口 ${PORT} 已被占用，请换个端口`);
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down MiniHTTP server...');
  server.close(() => {
    console.log('Server closed. Total requests handled:', requestCount);
    process.exit(0);
  });
});
