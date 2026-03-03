/**
 * demo-http2.js
 * Node.js http2 模块演示：Server Push、Header 压缩、多路复用
 *
 * 运行前准备（生成自签名证书）:
 *   node -e "
 *     const { execSync } = require('child_process');
 *     execSync('openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -subj /CN=localhost', { stdio: 'inherit' });
 *     console.log('证书生成完毕: key.pem, cert.pem');
 *   "
 *
 * 运行: node demo-http2.js
 *
 * 测试:
 *   curl -k --http2 https://localhost:8443/
 *   curl -k --http2 https://localhost:8443/push-demo
 *   curl -k --http2-prior-knowledge https://localhost:8444/  (cleartext h2c)
 */

const http2 = require('http2');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

// ─── 证书处理 ──────────────────────────────────────────────────────────────────

function loadOrCreateCert() {
  const keyPath = path.join(__dirname, 'key.pem');
  const certPath = path.join(__dirname, 'cert.pem');
  
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    };
  }
  
  // 用纯 JS 生成简单的自签名证书（用于演示，实际生产用 openssl）
  console.log('⚠️  未找到 key.pem/cert.pem，请先运行:');
  console.log('   openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -subj /CN=localhost');
  console.log('\n   或安装 selfsigned 包:');
  console.log('   npm install selfsigned');
  console.log('   然后修改此脚本使用 selfsigned.generate()');
  process.exit(1);
}

// ─── HTTP/2 服务器 ─────────────────────────────────────────────────────────────

function startH2Server() {
  const { key, cert } = loadOrCreateCert();
  
  const server = http2.createSecureServer({
    key,
    cert,
    allowHTTP1: true,  // 允许 HTTP/1.1 降级
    settings: {
      // HTTP/2 SETTINGS 帧参数
      headerTableSize: 65536,          // HPACK 动态表大小
      enablePush: true,                // 允许 Server Push
      initialWindowSize: 65535,        // 初始流量控制窗口
      maxFrameSize: 16384,             // 最大帧大小
      maxConcurrentStreams: 100,        // 最大并发流数量
      maxHeaderListSize: 65535,        // 最大头部列表大小
    }
  });

  // 记录协议协商结果
  server.on('session', (session) => {
    const socket = session.socket;
    console.log(`\n[Session] 新连接来自 ${socket.remoteAddress}:${socket.remotePort}`);
    console.log(`  ALPN 协商协议: ${socket.alpnProtocol || 'http/1.1'}`);
    
    session.on('remoteSettings', (settings) => {
      console.log('  客户端 SETTINGS:', JSON.stringify(settings));
    });
    
    session.on('localSettings', (settings) => {
      console.log('  服务端 SETTINGS:', JSON.stringify(settings));
    });
  });

  // 处理 HTTP 请求（包括 HTTP/1.1 和 HTTP/2）
  server.on('request', (req, res) => {
    // 检测协议版本
    const protocol = req.httpVersion === '2.0' ? 'HTTP/2' : `HTTP/${req.httpVersion}`;
    console.log(`\n[${protocol}] ${req.method} ${req.url}`);
    
    // 打印 HTTP/2 伪头部
    if (req.httpVersion === '2.0') {
      console.log('  HTTP/2 headers (HPACK 压缩传输后解压):');
      console.log(`    :method = ${req.headers[':method'] || req.method}`);
      console.log(`    :path = ${req.headers[':path'] || req.url}`);
      console.log(`    :scheme = ${req.headers[':scheme'] || 'https'}`);
      console.log(`    :authority = ${req.headers[':authority'] || req.headers.host}`);
    }
    
    const url = req.url;
    
    if (url === '/') {
      handleHome(req, res);
    } else if (url === '/push-demo') {
      handlePushDemo(req, res);
    } else if (url === '/multiplexing') {
      handleMultiplexing(req, res);
    } else if (url.startsWith('/stream/')) {
      handleStream(req, res);
    } else if (url === '/style.css') {
      handleCss(req, res);
    } else if (url === '/app.js') {
      handleJs(req, res);
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  const PORT = 8443;
  server.listen(PORT, () => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🚀 HTTP/2 Server with TLS (ALPN)');
    console.log(`   https://localhost:${PORT}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n测试地址 (使用 curl -k 跳过证书验证):');
    console.log(`  curl -k --http2 -v https://localhost:${PORT}/`);
    console.log(`  curl -k --http2 -v https://localhost:${PORT}/push-demo`);
    console.log(`  curl -k --http2 -v https://localhost:${PORT}/multiplexing`);
    console.log('\n查看 ALPN 协商:');
    console.log(`  openssl s_client -connect localhost:${PORT} -alpn h2`);
  });
  
  return server;
}

// ─── 路由处理器 ────────────────────────────────────────────────────────────────

function handleHome(req, res) {
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-cache',
  });
  res.end(`<!DOCTYPE html>
<html>
<head>
  <title>HTTP/2 Demo</title>
  <meta charset="UTF-8">
</head>
<body>
  <h1>HTTP/${req.httpVersion} Demo Server</h1>
  <p>协议版本: <strong>HTTP/${req.httpVersion}</strong></p>
  <h2>测试接口</h2>
  <ul>
    <li><a href="/push-demo">Server Push 演示</a> — HTML + CSS + JS 同时推送</li>
    <li><a href="/multiplexing">多路复用演示</a> — 并发多个流</li>
    <li><a href="/stream/1">流1</a> / <a href="/stream/2">流2</a> / <a href="/stream/3">流3</a></li>
  </ul>
</body>
</html>`);
}

function handlePushDemo(req, res) {
  // ⚡ HTTP/2 Server Push：在响应 HTML 之前主动推送 CSS 和 JS
  // 客户端收到 PUSH_PROMISE 帧后，后续请求这些资源时会直接用缓存
  
  if (res.stream && res.stream.pushAllowed) {
    // 推送 CSS
    res.stream.pushStream(
      { 
        ':path': '/style.css',
        ':method': 'GET',
        ':scheme': 'https',
        ':authority': req.headers[':authority'] || req.headers.host || 'localhost:8443',
      }, 
      (err, pushStream) => {
        if (err) {
          console.error('Push CSS failed:', err.message);
          return;
        }
        console.log('  → Server Push: /style.css (stream id:', pushStream.id, ')');
        pushStream.respond({
          ':status': 200,
          'content-type': 'text/css',
          'cache-control': 'max-age=3600',
        });
        pushStream.end('body { font-family: Arial; background: #f0f8ff; } h1 { color: #0066cc; }');
      }
    );
    
    // 推送 JS
    res.stream.pushStream(
      { 
        ':path': '/app.js',
        ':method': 'GET',
        ':scheme': 'https',
        ':authority': req.headers[':authority'] || req.headers.host || 'localhost:8443',
      },
      (err, pushStream) => {
        if (err) {
          console.error('Push JS failed:', err.message);
          return;
        }
        console.log('  → Server Push: /app.js (stream id:', pushStream.id, ')');
        pushStream.respond({
          ':status': 200,
          'content-type': 'application/javascript',
          'cache-control': 'max-age=3600',
        });
        pushStream.end(`
          document.addEventListener('DOMContentLoaded', () => {
            const el = document.getElementById('status');
            if (el) {
              el.textContent = 'CSS 和 JS 都通过 Server Push 推送! 无需额外请求 🚀';
              el.style.color = 'green';
            }
          });
        `);
      }
    );
  } else {
    console.log('  (HTTP/1.1 降级模式，不支持 Server Push)');
  }
  
  // 响应 HTML
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
  });
  res.end(`<!DOCTYPE html>
<html>
<head>
  <title>Server Push Demo</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <h1>🚀 HTTP/2 Server Push Demo</h1>
  <p id="status">加载中...</p>
  <p>打开 DevTools Network 面板，观察 CSS 和 JS 的请求发起方是 "Push" 而非 "Other"。</p>
  <p>Stream IDs: HTML=1, CSS=2 (pushed), JS=4 (pushed)</p>
  <script src="/app.js"></script>
</body>
</html>`);
}

function handleCss(req, res) {
  res.writeHead(200, { 'content-type': 'text/css' });
  res.end('body { font-family: Arial; }');
}

function handleJs(req, res) {
  res.writeHead(200, { 'content-type': 'application/javascript' });
  res.end('console.log("JS loaded (non-pushed fallback)");');
}

function handleMultiplexing(req, res) {
  // 展示流 ID（HTTP/2 每个请求有唯一的奇数 Stream ID）
  const streamId = res.stream ? res.stream.id : 'N/A';
  
  res.writeHead(200, {
    'content-type': 'application/json',
    'x-stream-id': String(streamId),
  });
  
  res.end(JSON.stringify({
    message: 'HTTP/2 多路复用演示',
    streamId,
    protocol: `HTTP/${req.httpVersion}`,
    headers: req.headers,
    tip: '用 HTTP/2 客户端并发请求，所有请求共享同一个 TCP 连接！',
  }, null, 2));
}

function handleStream(req, res) {
  const streamNum = req.url.split('/')[2];
  const delay = parseInt(streamNum) * 100; // 不同流不同延迟
  
  // 模拟处理延迟
  setTimeout(() => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      stream: streamNum,
      delay: `${delay}ms`,
      streamId: res.stream?.id || 'N/A',
      time: new Date().toISOString(),
    }));
  }, delay);
}

// ─── HTTP/1.1 vs HTTP/2 延迟对比 ──────────────────────────────────────────────

async function benchmarkComparison() {
  console.log('\n━━━━━━━━━━━━━━━ HTTP/1.1 vs HTTP/2 延迟对比 ━━━━━━━━━━━━━━━');
  console.log('(内部请求，测量连接复用效果)\n');
  
  // HTTP/2 客户端：多路复用
  const h2Client = http2.connect('https://localhost:8443', {
    rejectUnauthorized: false,
  });
  
  const makeH2Request = (path) => new Promise((resolve, reject) => {
    const start = performance.now();
    const req = h2Client.request({ ':path': path });
    let data = '';
    req.on('response', () => {});
    req.on('data', chunk => data += chunk);
    req.on('end', () => resolve(performance.now() - start));
    req.on('error', reject);
    req.end();
  });
  
  // 等待连接建立
  await new Promise(resolve => h2Client.once('connect', resolve));
  
  // HTTP/2：并发 5 个请求（复用同一连接）
  console.log('HTTP/2 并发 5 个请求（同一连接，多路复用）:');
  const h2Start = performance.now();
  const h2Times = await Promise.all([
    makeH2Request('/stream/1'),
    makeH2Request('/stream/2'),
    makeH2Request('/stream/3'),
    makeH2Request('/stream/1'),
    makeH2Request('/stream/2'),
  ]);
  const h2Total = performance.now() - h2Start;
  
  h2Times.forEach((t, i) => console.log(`  请求 ${i+1}: ${t.toFixed(1)}ms`));
  console.log(`  ⏱ 总耗时: ${h2Total.toFixed(1)}ms (并发，不受延迟叠加影响)\n`);
  
  h2Client.close();
  
  console.log('注意: HTTP/1.1 相当场景需要 6 个并发连接，且有队头阻塞问题');
  console.log('HTTP/2 所有请求通过 1 个连接，Stream IDs 为不同奇数');
}

// ─── HTTP/2 头部压缩演示 ───────────────────────────────────────────────────────

function printHpackDemo() {
  console.log('\n━━━━━━━━━━━━━━━ HPACK 压缩演示（原理展示）━━━━━━━━━━━━━━━');
  
  // 模拟连续两次请求的头部
  const request1Headers = {
    ':method': 'GET',
    ':path': '/api/users',
    ':scheme': 'https',
    ':authority': 'api.example.com',
    'user-agent': 'Node.js/20.0',
    'accept': 'application/json',
    'authorization': 'Bearer eyJhbGc...',
    'x-request-id': 'abc123',
  };
  
  const request2Headers = {
    ':method': 'GET',           // 静态表 index 2
    ':path': '/api/products',   // 新路径
    ':scheme': 'https',         // 与请求1相同 → 使用动态表索引
    ':authority': 'api.example.com', // 与请求1相同
    'user-agent': 'Node.js/20.0',    // 与请求1相同
    'accept': 'application/json',    // 与请求1相同
    'authorization': 'Bearer eyJhbGc...', // 与请求1相同→索引
    'x-request-id': 'def456',   // 不同值
  };
  
  // 计算原始头部大小
  const size1 = Object.entries(request1Headers).reduce((sum, [k, v]) => sum + k.length + v.length + 4, 0);
  const size2 = Object.entries(request2Headers).reduce((sum, [k, v]) => sum + k.length + v.length + 4, 0);
  
  console.log('第一次请求头部（完整发送）:');
  Object.entries(request1Headers).forEach(([k, v]) => {
    const isStatic = [':method', ':path', ':scheme', ':authority'].includes(k);
    console.log(`  ${k}: ${v.slice(0, 30)}... [${isStatic ? '静态表' : '动态表新增'}]`);
  });
  console.log(`  原始大小: ~${size1} bytes`);
  console.log(`  HPACK 后: ~${Math.round(size1 * 0.4)} bytes (估算，60% 压缩)\n`);
  
  console.log('第二次请求头部（大部分走索引）:');
  Object.entries(request2Headers).forEach(([k, v]) => {
    const changed = request1Headers[k] !== request2Headers[k];
    console.log(`  ${k}: ${v.slice(0, 30)} [${changed ? '新值' : '→ 动态表索引（仅1-2字节）'}]`);
  });
  console.log(`  原始大小: ~${size2} bytes`);
  console.log(`  HPACK 后: ~8 bytes (估算，99% 压缩！大部分走索引)`);
}

// ─── 主程序 ────────────────────────────────────────────────────────────────────

async function main() {
  const server = startH2Server();
  
  printHpackDemo();
  
  // 等待服务器启动后运行基准测试
  setTimeout(async () => {
    try {
      await benchmarkComparison();
    } catch (err) {
      console.log('\n[基准测试跳过] 确保服务器证书有效或使用 curl 手动测试');
      console.log('  原因:', err.message);
    }
  }, 1000);
  
  // 优雅退出
  process.on('SIGINT', () => {
    console.log('\n\n👋 关闭 HTTP/2 服务器...');
    server.close(() => process.exit(0));
  });
}

main().catch(console.error);
