/**
 * demo-oauth2-flow.js
 * 演示 OAuth2 PKCE 流程及 CSRF 防护
 * 内置简单 HTTP 服务器模拟授权服务器和应用服务器
 */

'use strict';

const http = require('http');
const crypto = require('crypto');
const { URL, URLSearchParams } = require('url');

// ─── PKCE 工具 ─────────────────────────────────────────────────────────────────

function generateCodeVerifier() {
  // RFC 7636: 43-128 个 URL-safe 字符
  return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier) {
  // S256 方法: BASE64URL(SHA256(verifier))
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

function generateState() {
  return crypto.randomBytes(16).toString('hex');
}

// ─── 内存存储（模拟数据库）─────────────────────────────────────────────────────

const authCodes = new Map();    // code → { clientId, userId, challenge, expiresAt }
const accessTokens = new Map(); // token → { userId, scope, expiresAt }
const stateStore = new Map();   // state → { verifier, createdAt }

// ─── 模拟认证服务器（AS）端口 3001 ─────────────────────────────────────────────

const authServer = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost:3001');

  res.setHeader('Content-Type', 'application/json');

  // ─── GET /authorize ── 显示"授权页面"并生成 code ─────
  if (req.method === 'GET' && url.pathname === '/authorize') {
    const clientId     = url.searchParams.get('client_id');
    const redirectUri  = url.searchParams.get('redirect_uri');
    const challenge    = url.searchParams.get('code_challenge');
    const method       = url.searchParams.get('code_challenge_method');
    const state        = url.searchParams.get('state');
    const responseType = url.searchParams.get('response_type');

    if (responseType !== 'code') {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'unsupported_response_type' }));
    }

    if (!challenge || method !== 'S256') {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: 'pkce_required' }));
    }

    // 模拟：用户已登录，自动授权（真实场景会显示 UI）
    const code = crypto.randomBytes(20).toString('hex');
    authCodes.set(code, {
      clientId, userId: 'user123',
      challenge, redirectUri,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10分钟
    });

    console.log(`[AS] 生成授权码: ${code.slice(0, 10)}...`);

    // 重定向回 Client
    res.writeHead(302, {
      Location: `${redirectUri}?code=${code}&state=${state}`,
    });
    return res.end();
  }

  // ─── POST /token ── 用 code + verifier 换 access_token ──
  if (req.method === 'POST' && url.pathname === '/token') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      const params = new URLSearchParams(body);
      const grantType    = params.get('grant_type');
      const code         = params.get('code');
      const verifier     = params.get('code_verifier');
      const redirectUri  = params.get('redirect_uri');

      if (grantType !== 'authorization_code') {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: 'unsupported_grant_type' }));
      }

      const stored = authCodes.get(code);
      if (!stored || Date.now() > stored.expiresAt) {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: 'invalid_grant', hint: 'Code expired or not found' }));
      }

      // 验证 PKCE: SHA256(verifier) == challenge
      const expectedChallenge = crypto.createHash('sha256').update(verifier).digest('base64url');
      if (expectedChallenge !== stored.challenge) {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: 'invalid_grant', hint: 'PKCE verification failed' }));
      }

      authCodes.delete(code); // 授权码一次性！

      const accessToken = crypto.randomBytes(32).toString('hex');
      accessTokens.set(accessToken, {
        userId: stored.userId,
        scope: 'read:profile read:email',
        expiresAt: Date.now() + 3600 * 1000,
      });

      console.log(`[AS] 颁发 access_token: ${accessToken.slice(0, 10)}...`);
      res.writeHead(200);
      res.end(JSON.stringify({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'read:profile read:email',
      }));
    });
    return;
  }

  // ─── GET /userinfo ── 资源服务器（验证 token）──────────
  if (req.method === 'GET' && url.pathname === '/userinfo') {
    const authHeader = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      res.writeHead(401);
      return res.end(JSON.stringify({ error: 'unauthorized' }));
    }
    const token = authHeader.slice(7);
    const info = accessTokens.get(token);
    if (!info || Date.now() > info.expiresAt) {
      res.writeHead(401);
      return res.end(JSON.stringify({ error: 'invalid_token' }));
    }
    res.writeHead(200);
    return res.end(JSON.stringify({
      sub: info.userId,
      name: 'Alice Example',
      email: 'alice@example.com',
      scope: info.scope,
    }));
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'not_found' }));
});

// ─── 模拟 OAuth2 Client 流程 ──────────────────────────────────────────────────

function makeRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, headers: res.headers, body: data });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function runOAuth2PKCEFlow() {
  console.log('\n========================================');
  console.log('OAuth2 Authorization Code + PKCE 流程');
  console.log('========================================');

  // Step 1: 生成 PKCE
  const codeVerifier  = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state         = generateState();

  console.log(`\nStep 1: 生成 PKCE`);
  console.log(`  code_verifier  : ${codeVerifier.substring(0, 20)}...`);
  console.log(`  code_challenge : ${codeChallenge.substring(0, 20)}... (SHA256)`);
  console.log(`  state          : ${state}`);

  // Step 2: 构造授权 URL
  const authUrl = new URL('http://localhost:3001/authorize');
  authUrl.searchParams.set('response_type',          'code');
  authUrl.searchParams.set('client_id',              'myapp-client');
  authUrl.searchParams.set('redirect_uri',           'http://localhost:3002/callback');
  authUrl.searchParams.set('scope',                  'read:profile read:email');
  authUrl.searchParams.set('code_challenge',         codeChallenge);
  authUrl.searchParams.set('code_challenge_method',  'S256');
  authUrl.searchParams.set('state',                  state);

  console.log(`\nStep 2: 重定向到授权服务器`);
  console.log(`  URL: ${authUrl.toString().substring(0, 80)}...`);

  // Step 3: 模拟 AS 处理（直接调用）
  const authorizeRes = await makeRequest({
    hostname: 'localhost',
    port: 3001,
    path: authUrl.pathname + '?' + authUrl.searchParams.toString(),
    method: 'GET',
  });

  const callbackUrl = new URL(authorizeRes.headers.location);
  const code        = callbackUrl.searchParams.get('code');
  const returnedState = callbackUrl.searchParams.get('state');

  console.log(`\nStep 3: 收到授权码`);
  console.log(`  code : ${code.substring(0, 20)}...`);
  console.log(`  state: ${returnedState} (验证一致: ${returnedState === state ? '✅' : '❌'})`);

  // Step 4: 用授权码换 access_token
  const tokenBody = new URLSearchParams({
    grant_type:    'authorization_code',
    code,
    code_verifier: codeVerifier, // PKCE 关键：verifier 只有 Client 知道
    redirect_uri:  'http://localhost:3002/callback',
    client_id:     'myapp-client',
  }).toString();

  const tokenRes = await makeRequest({
    hostname: 'localhost',
    port: 3001,
    path: '/token',
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': tokenBody.length },
  }, tokenBody);

  const tokenData = JSON.parse(tokenRes.body);
  console.log(`\nStep 4: 换取 access_token`);
  console.log(`  access_token: ${tokenData.access_token?.substring(0, 20)}...`);
  console.log(`  expires_in  : ${tokenData.expires_in}s`);

  // Step 5: 调用 API
  const userRes = await makeRequest({
    hostname: 'localhost',
    port: 3001,
    path: '/userinfo',
    method: 'GET',
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  console.log(`\nStep 5: 访问用户信息`);
  console.log(`  `, JSON.parse(userRes.body));

  // 演示：错误的 code_verifier 被拒绝
  console.log('\n--- 攻击演示：使用错误的 code_verifier ---');
  const attackCode = (await makeRequest({
    hostname: 'localhost', port: 3001,
    path: authUrl.pathname + '?' + authUrl.searchParams.toString() + `&state=${generateState()}`,
    method: 'GET',
  })).headers.location;
  const stolenCode = new URL(attackCode).searchParams.get('code');

  const attackBody = new URLSearchParams({
    grant_type: 'authorization_code', code: stolenCode,
    code_verifier: generateCodeVerifier(), // 错误的 verifier！
    redirect_uri: 'http://localhost:3002/callback', client_id: 'myapp-client',
  }).toString();

  const attackRes = await makeRequest({
    hostname: 'localhost', port: 3001, path: '/token', method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': attackBody.length },
  }, attackBody);

  console.log(`  结果: ${attackRes.statusCode} ${JSON.parse(attackRes.body).hint}`);
}

// ─── 启动并运行 ────────────────────────────────────────────────────────────────

authServer.listen(3001, async () => {
  try {
    await runOAuth2PKCEFlow();
  } catch (err) {
    console.error('错误:', err);
  } finally {
    authServer.close();
  }
});
