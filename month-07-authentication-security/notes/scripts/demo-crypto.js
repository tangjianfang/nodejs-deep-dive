/**
 * demo-crypto.js
 * Node.js crypto 模块实战：哈希、HMAC、AES-256-GCM、RSA、密码存储
 */

'use strict';

const {
  createHash, createHmac,
  createCipheriv, createDecipheriv,
  generateKeyPairSync, createSign, createVerify,
  randomBytes, scryptSync, timingSafeEqual,
} = require('crypto');

// ─── 1. 哈希 ──────────────────────────────────────────────────────────────────

console.log('=== 1. 哈希（SHA-256）===');
const hash1 = createHash('sha256').update('hello').digest('hex');
const hash2 = createHash('sha256').update('hello').digest('hex');
const hash3 = createHash('sha256').update('Hello').digest('hex'); // 大写 H 不同
console.log('SHA256("hello"):', hash1);
console.log('相同输入相同输出:', hash1 === hash2);
console.log('大小写不同结果不同:', hash1 !== hash3);

// ─── 2. HMAC ──────────────────────────────────────────────────────────────────

console.log('\n=== 2. HMAC-SHA256（带密钥哈希）===');
const key = 'my-webhook-secret';
const body = '{"event":"payment","amount":100}';

const webhookSig = createHmac('sha256', key).update(body).digest('hex');
console.log('Webhook 签名:', webhookSig.substring(0, 32) + '...');

// 时序安全验证
function verifyWebhookSignature(body, receivedSig, secret) {
  const expected = createHmac('sha256', secret).update(body).digest();
  const received = Buffer.from(receivedSig, 'hex');
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received); // ← 时序安全！
}

console.log('签名验证:', verifyWebhookSignature(body, webhookSig, key));
console.log('篡改后验证:', verifyWebhookSignature(body + 'x', webhookSig, key));

// ─── 3. AES-256-GCM（认证加密）─────────────────────────────────────────────────

console.log('\n=== 3. AES-256-GCM（对称加密）===');

function encrypt(plaintext, key32) {
  const iv = randomBytes(12);                // 96-bit IV（GCM 推荐）
  const cipher = createCipheriv('aes-256-gcm', key32, iv);
  const enc = Buffer.concat([
    cipher.update(Buffer.from(plaintext, 'utf8')),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();           // 认证标签（16 bytes）
  // 拼接: iv(12) + tag(16) + ciphertext
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decrypt(ciphertextBase64, key32) {
  const buf = Buffer.from(ciphertextBase64, 'base64');
  const iv  = buf.slice(0, 12);
  const tag = buf.slice(12, 28);
  const enc = buf.slice(28);
  const decipher = createDecipheriv('aes-256-gcm', key32, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

const aesKey = randomBytes(32); // 256-bit key
const secret = '信用卡号: 4111-1111-1111-1111';
const ciphertext = encrypt(secret, aesKey);
const decrypted  = decrypt(ciphertext, aesKey);

console.log('原文:   ', secret);
console.log('密文:   ', ciphertext.substring(0, 40) + '...');
console.log('解密:   ', decrypted);
console.log('一致性:', secret === decrypted);

// 验证认证标签（防篡改）
try {
  const tampered = Buffer.from(ciphertext, 'base64');
  tampered[30] ^= 0xFF; // 篡改一个字节
  decrypt(tampered.toString('base64'), aesKey);
} catch (err) {
  console.log('✅ 篡改被检测到:', err.message);
}

// ─── 4. RSA 签名 ──────────────────────────────────────────────────────────────

console.log('\n=== 4. RSA-2048 数字签名 ===');

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding:  { type: 'spki',  format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const message = '{"userId":123,"action":"transfer","amount":1000}';
const signature = createSign('SHA256').update(message).sign(privateKey, 'base64');

console.log('消息:  ', message);
console.log('签名:  ', signature.substring(0, 40) + '...');

const isValid1 = createVerify('SHA256').update(message).verify(publicKey, signature, 'base64');
const isValid2 = createVerify('SHA256').update(message + '!').verify(publicKey, signature, 'base64');

console.log('验证原始消息:', isValid1 ? '✅ 有效' : '❌ 无效');
console.log('验证篡改消息:', isValid2 ? '⚠️ 有效（不应该）' : '✅ 篡改被检测');

// ─── 5. 密码存储（scrypt）─────────────────────────────────────────────────────

console.log('\n=== 5. 密码安全存储（scrypt）===');

function hashPassword(password) {
  const salt = randomBytes(16);
  // scrypt: CPU + 内存密集型，比 bcrypt 更强
  const derived = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `${salt.toString('hex')}:${derived.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [saltHex, hashHex] = stored.split(':');
  const salt = Buffer.from(saltHex, 'hex');
  const hash = Buffer.from(hashHex, 'hex');
  const derived = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return timingSafeEqual(hash, derived);
}

console.log('正在哈希密码（scrypt，耗时约 100ms）...');
const start = Date.now();
const storedHash = hashPassword('MyP@ssw0rd!');
console.log(`哈希耗时: ${Date.now() - start}ms`);
console.log('存储的哈希（截断）:', storedHash.substring(0, 50) + '...');

console.log('验证正确密码:', verifyPassword('MyP@ssw0rd!', storedHash) ? '✅' : '❌');
console.log('验证错误密码:', verifyPassword('wrongpassword', storedHash) ? '⚠️' : '✅ 拒绝');

// ─── 6. 生成安全随机 token ────────────────────────────────────────────────────

console.log('\n=== 6. 安全随机 Token ===');
const refreshToken = randomBytes(32).toString('hex');       // 64字符 hex
const sessionId    = randomBytes(16).toString('base64url'); // URL安全 Base64
console.log('Refresh Token:', refreshToken);
console.log('Session ID:   ', sessionId);
