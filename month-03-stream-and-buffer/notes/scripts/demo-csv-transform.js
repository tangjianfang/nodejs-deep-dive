/**
 * Demo: CSV Transform Stream
 * 将 CSV 字节流转换为 JSON 对象流
 *
 * 用法:
 *   node demo-csv-transform.js
 *   echo "name,age\nAlice,30\nBob,25" | node demo-csv-transform.js
 */

'use strict';

const { Transform, Readable } = require('stream');
const { pipeline } = require('stream/promises');

// ─────────────────────────────────────────────
// 1. LineTransform: Buffer → 逐行字符串
// ─────────────────────────────────────────────
class LineTransform extends Transform {
  constructor(options) {
    super({ ...options, objectMode: true });
    this._buffer = '';
  }

  _transform(chunk, encoding, callback) {
    this._buffer += chunk.toString();
    const lines = this._buffer.split('\n');
    // 最后一个可能是不完整的行，留到下次
    this._buffer = lines.pop();
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) this.push(trimmed);
    }
    callback();
  }

  _flush(callback) {
    if (this._buffer.trim()) this.push(this._buffer.trim());
    callback();
  }
}

// ─────────────────────────────────────────────
// 2. CsvParseTransform: 逐行字符串 → JS 对象
// ─────────────────────────────────────────────
class CsvParseTransform extends Transform {
  constructor(options) {
    super({ ...options, objectMode: true, readableObjectMode: true, writableObjectMode: true });
    this._headers = null;
  }

  _transform(line, encoding, callback) {
    const fields = this._parseCSVLine(line);

    if (this._headers === null) {
      // 第一行是表头
      this._headers = fields.map((h) => h.trim());
      callback();
      return;
    }

    if (fields.length !== this._headers.length) {
      // 列数不匹配，跳过并报警告
      process.stderr.write(`Warning: skipping malformed line: ${line}\n`);
      callback();
      return;
    }

    const obj = {};
    this._headers.forEach((header, i) => {
      obj[header] = fields[i].trim();
    });
    this.push(obj);
    callback();
  }

  // 支持字段中包含逗号（用引号包裹）
  _parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  }
}

// ─────────────────────────────────────────────
// 3. TypeCastTransform: 类型推断（字符串 → 数字/布尔值）
// ─────────────────────────────────────────────
class TypeCastTransform extends Transform {
  constructor(options) {
    super({ ...options, objectMode: true });
  }

  _transform(obj, encoding, callback) {
    const casted = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value === 'true') casted[key] = true;
      else if (value === 'false') casted[key] = false;
      else if (value !== '' && !isNaN(Number(value))) casted[key] = Number(value);
      else casted[key] = value;
    }
    this.push(casted);
    callback();
  }
}

// ─────────────────────────────────────────────
// 4. JsonStringifyTransform: JS 对象 → JSON 字符串
// ─────────────────────────────────────────────
class JsonStringifyTransform extends Transform {
  constructor(options) {
    super({ ...options, writableObjectMode: true });
    this._first = true;
    this.push('[\n');
  }

  _transform(obj, encoding, callback) {
    const prefix = this._first ? '  ' : ',\n  ';
    this._first = false;
    this.push(prefix + JSON.stringify(obj));
    callback();
  }

  _flush(callback) {
    this.push('\n]\n');
    callback();
  }
}

// ─────────────────────────────────────────────
// 5. 主程序：Pipeline 组装
// ─────────────────────────────────────────────
const CSV_SAMPLE = `name,age,city,active
Alice,30,"New York",true
Bob,25,"Los Angeles",false
Charlie,35,"Chicago, IL",true
Diana,28,Seattle,true
Eve,22,"San Francisco",false
`;

async function main() {
  console.log('=== CSV → JSON Transform Stream Demo ===\n');

  const inputStream = Readable.from([CSV_SAMPLE]);
  const output = [];

  // 收集输出的 Writable（对象模式）
  const { Writable } = require('stream');
  class CollectWritable extends Writable {
    constructor() { super({ objectMode: true }); }
    _write(obj, enc, cb) { output.push(obj); cb(); }
  }

  const collector = new CollectWritable();

  await pipeline(
    inputStream,
    new LineTransform(),
    new CsvParseTransform(),
    new TypeCastTransform(),
    collector,
  );

  console.log('Parsed objects:');
  console.log(JSON.stringify(output, null, 2));

  // 也可以直接输出 JSON 字符串
  console.log('\n=== JSON String Output Mode ===\n');
  const inputStream2 = Readable.from([CSV_SAMPLE]);
  await pipeline(
    inputStream2,
    new LineTransform(),
    new CsvParseTransform(),
    new TypeCastTransform(),
    new JsonStringifyTransform(),
    process.stdout,
  );
}

main().catch(console.error);
