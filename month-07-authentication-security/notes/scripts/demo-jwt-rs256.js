/**
 * demo-jwt-rs256.js
 * 从零实现 JWT RS256 签发与验证（使用 Node.js 内置 crypto 模块）
 */

'use strict';

const { generateKeyPairSync, createSign, createVerify } = require('crypto');

// ─── 工具函数 ──────────────────────────────────────────────────────────────────

function base64urlEncode(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64urlDecode(str) {
  const padded = str + '==='.slice(0, (4 - str.length % 4) % 4);
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

// ─── 生成 RSA-2048 密钥对 ─────────────────────────────────────────────────────

console.log('生成 RSA-2048 密钥对...');
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding:  { type: 'spki',  format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
console.log('密钥对生成成功\n');

// ─── JWT 实现 ──────────────────────────────────────────────────────────────────

function signJwt(payload, privKey, options = {}) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
    iat: now,
    ...options.expiresIn ? { exp: now + options.expiresIn } : {},
    ...payload,
  };

  const headerB64  = base64urlEncode(JSON.stringify(header));
  const payloadB64 = base64urlEncode(JSON.stringify(fullPayload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const sign = createSign('SHA256');
  sign.update(signingInput);
  const signature = base64urlEncode(sign.sign(privKey));

  return `${signingInput}.${signature}`;
}

function verifyJwt(token, pubKey, options = {}) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format');

  const [headerB64, payloadB64, signatureB64] = parts;

  // 1. 解析 header，检查算法
  const header = JSON.parse(base64urlDecode(headerB64).toString());
  const allowed = options.algorithms || ['RS256'];
  if (!allowed.includes(header.alg)) {
    throw new Error(`Algorithm ${header.alg} not allowed`);
  }

  // 2. 验证签名
  const signingInput = `${headerB64}.${payloadB64}`;
  const verify = createVerify('SHA256');
  verify.update(signingInput);
  const isValid = verify.verify(pubKey, base64urlDecode(signatureB64));
  if (!isValid) throw new Error('Invalid signature');

  // 3. 解析 payload
  const payload = JSON.parse(base64urlDecode(payloadB64).toString());
  const now = Math.floor(Date.now() / 1000);

  // 4. 验证 exp
  if (payload.exp && now > payload.exp) {
    throw new Error('Token expired');
  }

  // 5. 验证 nbf
  if (payload.nbf && now < payload.nbf) {
    throw new Error('Token not yet valid');
  }

  return payload;
}

// ─── Demo 1：基本签发与验证 ────────────────────────────────────────────────────

console.log('========================================');
console.log('Demo 1: 基本签发与验证');
console.log('========================================');

const token = signJwt(
  { sub: 'user123', name: 'Alice', role: 'admin' },
  privateKey,
  { expiresIn: 3600 }
);

console.log('生成的 JWT（前 80 字符）:');
console.log(token.substring(0, 80) + '...');

// 解码 Payload（不验证签名）
const [, payloadPart] = token.split('.');
const decoded = JSON.parse(base64urlDecode(payloadPart).toString());
console.log('\nPayload（Base64URL 解码，非加密！）:');
console.log(JSON.stringify(decoded, null, 2));

// 验证
const verified = verifyJwt(token, publicKey, { algorithms: ['RS256'] });
console.log('\n验证成功，Payload:');
console.log(JSON.stringify(verified, null, 2));

// ─── Demo 2：篡改检测 ──────────────────────────────────────────────────────────

console.log('\n========================================');
console.log('Demo 2: 篡改检测');
console.log('========================================');

const [h, p, s] = token.split('.');
// 篡改 payload：将 role 改为 superadmin
const tamperedPayload = Buffer.from(JSON.stringify({ ...decoded, role: 'superadmin' })).toString('base64url');
const tamperedToken = `${h}.${tamperedPayload}.${s}`;

try {
  verifyJwt(tamperedToken, publicKey);
  console.log('⚠️  验证通过（不应该发生！）');
} catch (err) {
  console.log(`✅ 篡改被检测到: ${err.message}`);
}

// ─── Demo 3：过期 Token ────────────────────────────────────────────────────────

console.log('\n========================================');
console.log('Demo 3: 过期 Token 检测');
console.log('========================================');

// 手动构造一个已过期的 token
const expiredPayload = { sub: 'user123', iat: 1000000000, exp: 1000003600 };
const expiredToken = signJwt(expiredPayload, privateKey);

try {
  verifyJwt(expiredToken, publicKey);
} catch (err) {
  console.log(`✅ 过期被检测到: ${err.message}`);
}

// ─── Demo 4：alg: none 攻击演示（防御） ──────────────────────────────────────

console.log('\n========================================');
console.log('Demo 4: alg:none 攻击防御');
console.log('========================================');

const noneHeader = base64urlEncode(JSON.stringify({ alg: 'none', typ: 'JWT' }));
const nonePayload = base64urlEncode(JSON.stringify({ sub: 'attacker', role: 'admin' }));
const noneToken = `${noneHeader}.${nonePayload}.`;

try {
  verifyJwt(noneToken, publicKey, { algorithms: ['RS256'] }); // 只允许 RS256
} catch (err) {
  console.log(`✅ alg:none 攻击被阻止: ${err.message}`);
}

// ─── Demo 5：RS256 vs HS256 性能 ──────────────────────────────────────────────

console.log('\n========================================');
console.log('Demo 5: RS256 vs HS256 性能对比');
console.log('========================================');

const { createHmac } = require('crypto');
const hmacSecret = require('crypto').randomBytes(32);

function signHS256(payload, secret) {
  const header  = base64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const pload   = base64urlEncode(JSON.stringify(payload));
  const input   = `${header}.${pload}`;
  const sig     = base64urlEncode(createHmac('sha256', secret).update(input).digest());
  return `${input}.${sig}`;
}

const ITERATIONS = 1000;
const testPayload = { sub: 'user', role: 'admin', iat: Date.now() };

const rs256Start = Date.now();
for (let i = 0; i < ITERATIONS; i++) signJwt(testPayload, privateKey);
const rs256Time = Date.now() - rs256Start;

const hs256Start = Date.now();
for (let i = 0; i < ITERATIONS; i++) signHS256(testPayload, hmacSecret);
const hs256Time = Date.now() - hs256Start;

console.log(`RS256 签名 ${ITERATIONS} 次: ${rs256Time}ms (${(rs256Time / ITERATIONS).toFixed(2)}ms/次)`);
console.log(`HS256 签名 ${ITERATIONS} 次: ${hs256Time}ms (${(hs256Time / ITERATIONS).toFixed(2)}ms/次)`);
console.log(`RS256 慢约 ${(rs256Time / hs256Time).toFixed(1)}x，但提供非对称安全保证`);
