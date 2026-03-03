/**
 * demo-system-design.js
 * Twitter 时间线系统设计模拟
 * Fan-out on Write vs Fan-out on Read 对比
 * run: node demo-system-design.js
 */

'use strict';

// ─── 内存数据层（模拟 DB + Redis）─────────────────────────────────────────────

class Database {
  constructor() {
    this.users = new Map();    // userId → { name, followerCount }
    this.tweets = new Map();   // tweetId → { userId, content, createdAt }
    this.follows = new Map();  // userId → Set<followeeId>
    this._tweetSeq = 1;
    this._queryCount = 0;
  }

  query(label) {
    this._queryCount++;
    // 模拟数据库查询延迟
    return label;
  }

  resetQueryCount() { this._queryCount = 0; }

  addUser(userId, name, followerCount = 100) {
    this.users.set(userId, { name, followerCount });
    this.follows.set(userId, new Set());
  }

  addFollow(followerId, followeeId) {
    if (!this.follows.has(followerId)) this.follows.set(followerId, new Set());
    this.follows.get(followerId).add(followeeId);
  }

  getFollowers(userId) {
    this.query('SELECT follower_id FROM follows WHERE followee_id = ?');
    const followers = [];
    for (const [fId, followSet] of this.follows) {
      if (followSet.has(userId)) followers.push(fId);
    }
    return followers;
  }

  getFollowees(userId) {
    this.query('SELECT followee_id FROM follows WHERE follower_id = ?');
    return [...(this.follows.get(userId) || [])];
  }

  createTweet(userId, content) {
    const id = this._tweetSeq++;
    const tweet = { id, userId, content, createdAt: Date.now() };
    this.tweets.set(id, tweet);
    return tweet;
  }

  getLatestTweets(userId, limit = 10) {
    this.query(`SELECT * FROM tweets WHERE user_id = ${userId} ORDER BY id DESC LIMIT ${limit}`);
    const results = [];
    for (const [, t] of this.tweets) {
      if (t.userId === userId) results.push(t);
    }
    return results.sort((a, b) => b.id - a.id).slice(0, limit);
  }
}

class RedisSimulator {
  constructor() {
    this._store = new Map();
    this._hitCount = 0;
    this._missCount = 0;
  }

  lpush(key, ...values) {
    if (!this._store.has(key)) this._store.set(key, []);
    this._store.get(key).unshift(...values);
  }

  lrange(key, start, end) {
    const list = this._store.get(key) || [];
    const result = end === -1 ? list.slice(start) : list.slice(start, end + 1);
    if (result.length > 0) this._hitCount++; else this._missCount++;
    return result;
  }

  ltrim(key, start, end) {
    if (this._store.has(key)) {
      const list = this._store.get(key);
      this._store.set(key, list.slice(start, end + 1));
    }
  }

  get stats() {
    return { hits: this._hitCount, misses: this._missCount };
  }
}

// ─── 方案 A: Fan-out on Write（写扩散）────────────────────────────────────────

class FanOutOnWriteTimeline {
  constructor(db, redis) {
    this.db = db;
    this.redis = redis;
  }

  postTweet(userId, content) {
    const tweet = this.db.createTweet(userId, content);
    const followers = this.db.getFollowers(userId); // 1 次 DB 查询

    const user = this.db.users.get(userId);
    // 大 V 跳过写扩散（超过 10 万粉丝）
    if (user.followerCount > 100_000) {
      console.log(`   跳过写扩散（大 V）: ${user.name} 有 ${user.followerCount.toLocaleString()} 粉丝`);
      return tweet;
    }

    // 写入每个粉丝的时间线缓存
    for (const followerId of followers) {
      this.redis.lpush(`timeline:${followerId}`, tweet.id);
      this.redis.ltrim(`timeline:${followerId}`, 0, 799); // 每人最多 800 条
    }
    console.log(`   写扩散: 写入 ${followers.length} 个粉丝的 timeline`);
    return tweet;
  }

  getTimeline(userId, limit = 5) {
    const tweetIds = this.redis.lrange(`timeline:${userId}`, 0, limit - 1);

    if (tweetIds.length === 0) {
      // Cache miss: 降级到 DB（实际应从关注列表重建缓存）
      console.log(`   Cache miss (userId=${userId})，从 DB 降级`);
      const followees = this.db.getFollowees(userId);
      const allTweets = followees.flatMap(fId => this.db.getLatestTweets(fId, 10));
      return allTweets.sort((a, b) => b.id - a.id).slice(0, limit);
    }

    // Cache hit: O(1) 读取，不需要额外 DB 查询
    return tweetIds.map(id => this.db.tweets.get(id)).filter(Boolean);
  }
}

// ─── 方案 B: Fan-out on Read（读扩散）────────────────────────────────────────

class FanOutOnReadTimeline {
  constructor(db) {
    this.db = db;
  }

  postTweet(userId, content) {
    // 简单写入 DB，不需要额外操作
    return this.db.createTweet(userId, content);
  }

  getTimeline(userId, limit = 5) {
    const followees = this.db.getFollowees(userId); // 1次 DB 查询
    console.log(`   读扩散: 查询 ${followees.length} 位关注者的推文`);

    // 每个关注者都需要一次 DB 查询
    const allTweets = followees.flatMap(fId => this.db.getLatestTweets(fId, 10));
    return allTweets.sort((a, b) => b.id - a.id).slice(0, limit);
  }
}

// ─── 演示 ─────────────────────────────────────────────────────────────────────

function setupTestData(db) {
  // 普通用户
  db.addUser('alice', 'Alice', 500);
  db.addUser('bob', 'Bob', 800);
  db.addUser('carol', 'Carol', 300);
  // 大 V
  db.addUser('elon', 'Elon Musk', 150_000_000);

  // alice 关注 bob 和 carol
  db.addFollow('alice', 'bob');
  db.addFollow('alice', 'carol');
  db.addFollow('alice', 'elon');

  // bob 也关注 carol
  db.addFollow('bob', 'carol');
  db.addFollow('bob', 'elon');

  // carol 关注 alice
  db.addFollow('carol', 'alice');
}

async function main() {
  console.log('='.repeat(60));
  console.log('  Twitter 时间线架构对比演示');
  console.log('='.repeat(60));

  const db = new Database();
  const redis = new RedisSimulator();
  setupTestData(db);

  // ── 方案 A: Fan-out on Write ──
  console.log('\n【方案 A: Fan-out on Write】');
  const writeTimeline = new FanOutOnWriteTimeline(db, redis);

  db.resetQueryCount();
  console.log('\n发布推文:');
  writeTimeline.postTweet('bob', 'Hello from Bob! 写扩散测试');
  writeTimeline.postTweet('carol', 'Carol 的第一条推文');
  writeTimeline.postTweet('elon', '大 V 发推: Starship launches！');
  console.log(`  发推 DB 查询数: ${db._queryCount}`);

  db.resetQueryCount();
  console.log('\n读取 alice 的时间线:');
  const writeTimelineResult = writeTimeline.getTimeline('alice', 3);
  console.log(`  读取时间线 DB 查询数: ${db._queryCount}`);
  console.log(`  Redis 缓存命中统计: ${JSON.stringify(redis.stats)}`);
  writeTimelineResult.forEach(t => console.log(`  - [${t.id}] ${t.content}`));

  // ── 方案 B: Fan-out on Read ──
  console.log('\n' + '─'.repeat(40));
  console.log('\n【方案 B: Fan-out on Read】');
  const db2 = new Database();
  setupTestData(db2);
  const readTimeline = new FanOutOnReadTimeline(db2);

  db2.resetQueryCount();
  console.log('\n发布推文:');
  readTimeline.postTweet('bob', 'Hello from Bob!');
  readTimeline.postTweet('carol', 'Carol 的第一条推文');
  readTimeline.postTweet('elon', '大 V 发推: Starship launches！');
  console.log(`  发推 DB 查询数: ${db2._queryCount}`);

  db2.resetQueryCount();
  console.log('\n读取 alice 的时间线:');
  const readTimelineResult = readTimeline.getTimeline('alice', 3);
  console.log(`  读取时间线 DB 查询数: ${db2._queryCount}`);
  readTimelineResult.forEach(t => console.log(`  - [${t.id}] ${t.content}`));

  // ── 对比总结 ──
  console.log('\n' + '='.repeat(60));
  console.log('  对比总结');
  console.log('='.repeat(60));
  console.log(`
  ┌──────────────┬─────────────────┬─────────────────┐
  │              │ Fan-out on Write │ Fan-out on Read  │
  ├──────────────┼─────────────────┼─────────────────┤
  │ 写操作       │ 慢（扩散写）    │ 快（直接写 DB） │
  │ 读操作       │ 快（O(1) Redis）│ 慢（N 次 DB 查）│
  │ 大 V 处理    │ 需要特殊处理    │ 自然处理        │
  │ 存储开销     │ 高（N份副本）   │ 低              │
  │ Twitter 策略 │ 普通用户        │ 大 V            │
  └──────────────┴─────────────────┴─────────────────┘
  `);
}

main().catch(console.error);
