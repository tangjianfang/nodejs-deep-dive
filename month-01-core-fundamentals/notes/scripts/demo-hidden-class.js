// 运行：node demo-hidden-class.js
const { performance } = require('node:perf_hooks');

function makeA() {
  const o = {};
  o.x = 1;
  o.y = 2;
  o.z = 3;
 return o; // 固定顺序
}

function makeB() {
  const o = {};
  o.y = 1;
  o.x = 3;
  o.z = 2; // y -> x -> z（与 A 不同） 顺序不同

  return o;
}

function access(o) {
  return o.x + o.y + o.z;
}

function runTest(make, label) {
  const arr = new Array(50_000);
  for (let i = 0; i < arr.length; i++) arr[i] = make();

  for (let r = 0; r < 5; r++) {
    for (let i = 0; i < arr.length; i++) access(arr[i]); // 预热
  }

  const t0 = performance.now();
  let s = 0;
  for (let i = 0; i < 50; i++) {
    for (let j = 0; j < arr.length; j++) s += access(arr[j]);
  }
  const t1 = performance.now();
  console.log(label, 'time=', (t1 - t0).toFixed(2) + 'ms', 'sum=', s);
}

runTest(makeA, 'makeA (consistent shape)');
runTest(makeB, 'makeB (different add order)');