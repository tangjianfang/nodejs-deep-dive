/**
 * 手写 require() —— 理解 Node.js 模块加载的核心机制
 *
 * 运行：node demo-my-require.js
 *
 * 这个实现覆盖了 require() 的核心流程：
 * 1. 路径解析（resolve）
 * 2. 缓存检查
 * 3. 文件读取
 * 4. 包裹成函数并执行
 * 5. 返回 module.exports
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ========== 模块缓存 ==========
const moduleCache = {};

// ========== 手写 require ==========
function createRequire(callerDir) {
  // 为每个模块创建专属的 require 函数（解析路径基于调用者目录）
  function localRequire(id) {
    // 1. 路径解析（基于调用者所在目录）
    const absolutePath = myResolve(id, callerDir);

    // 2. 检查缓存（同一模块只执行一次）
    if (moduleCache[absolutePath]) {
      console.log(`[cache hit] ${id}`);
      return moduleCache[absolutePath].exports;
    }

    // 3. 创建 module 对象
    const module = {
      id: absolutePath,
      exports: {},
      loaded: false,
    };

    // 4. 写入缓存（必须在执行前写入，否则循环依赖会死循环）
    moduleCache[absolutePath] = module;

    // 5. 根据文件类型加载
    const ext = path.extname(absolutePath);
    if (ext === '.json') {
      // JSON 文件：直接 parse
      const content = fs.readFileSync(absolutePath, 'utf-8');
      module.exports = JSON.parse(content);
    } else {
      // JS 文件：包裹并执行
      const code = fs.readFileSync(absolutePath, 'utf-8');

      // 这就是 Node.js 内部做的"模块包裹"
      const wrapper = `(function(exports, require, module, __filename, __dirname) {\n${code}\n});`;

      // 用 vm.runInThisContext 编译（比 eval 更安全，有独立的文件名标识）
      const compiledFn = vm.runInThisContext(wrapper, {
        filename: absolutePath,
      });

      // 执行包裹函数，注入 5 个参数
      // 注意：传入的 require 是基于当前模块目录创建的新 require
      const dirname = path.dirname(absolutePath);
      compiledFn(module.exports, createRequire(dirname), module, absolutePath, dirname);
    }

    // 6. 标记加载完成
    module.loaded = true;

    return module.exports;
  }
  return localRequire;
}

// 主入口的 require（基于当前脚本目录）
const myRequire = createRequire(__dirname);

// ========== 路径解析 ==========
function myResolve(id, callerDir) {
  // 简化版：只处理相对路径和 .js / .json
  // 完整版还需处理：内置模块、node_modules 逐级查找、目录的 index.js 等
  let filePath = path.resolve(callerDir, id);

  // 尝试补全扩展名：.js → .json
  if (fs.existsSync(filePath)) return filePath;
  if (fs.existsSync(filePath + '.js')) return filePath + '.js';
  if (fs.existsSync(filePath + '.json')) return filePath + '.json';

  // 尝试目录：找 index.js
  if (fs.existsSync(path.join(filePath, 'index.js'))) {
    return path.join(filePath, 'index.js');
  }

  throw new Error(`Cannot find module '${id}'`);
}

// ========== 测试 ==========

// 创建临时测试模块
const testDir = path.join(__dirname, '_test_modules');
if (!fs.existsSync(testDir)) fs.mkdirSync(testDir);

// 写入测试文件
fs.writeFileSync(
  path.join(testDir, 'greet.js'),
  `
const msg = 'Hello from greet.js!';
module.exports = { msg, greet: (name) => msg + ' ' + name };
`
);

fs.writeFileSync(
  path.join(testDir, 'config.json'),
  JSON.stringify({ version: '1.0.0', debug: true })
);

fs.writeFileSync(
  path.join(testDir, 'use-greet.js'),
  `
const greet = require('./greet');  // 这里的 require 其实是我们注入的 myRequire
module.exports = { result: greet.greet('Node.js') };
`
);

console.log('=== 手写 require 测试 ===\n');

// 测试 1：加载 JS 模块
const greet = myRequire('./_test_modules/greet');
console.log('1. JS 模块:', greet.msg);
console.log('   greet("World"):', greet.greet('World'));

// 测试 2：加载 JSON 文件
const config = myRequire('./_test_modules/config.json');
console.log('\n2. JSON 模块:', config);

// 测试 3：验证缓存（第二次加载不重新执行）
const greet2 = myRequire('./_test_modules/greet');
console.log('\n3. 缓存验证:', greet === greet2 ? '✅ 缓存命中，同一对象' : '❌ 缓存失败');

// 测试 4：嵌套 require（模块内部 require 其他模块）
const useGreet = myRequire('./_test_modules/use-greet');
console.log('\n4. 嵌套 require:', useGreet.result);

// 清理测试文件
fs.rmSync(testDir, { recursive: true });

console.log('\n=== 测试完成 ===');

console.log(`
核心要点回顾：
1. require() 本质是"包裹源码为函数 + 执行 + 返回 module.exports"
2. 模块缓存基于完整路径，同一文件只执行一次
3. 缓存必须在执行前写入，否则循环依赖会死循环
4. exports 是 module.exports 的引用，不能直接赋值替换
5. 路径解析有优先级：内置模块 > 相对/绝对路径 > node_modules
`);
