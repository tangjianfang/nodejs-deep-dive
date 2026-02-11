const { performance } = require('node:perf_hooks');

function hotFn(n) {
  let x = 0;
  for (let i = 0; i < n; i++) x += i;
  return x;
}

function measure(label, fn) {
  const t0 = performance.now();
  const r = fn();
  const t1 = performance.now();
  console.log(label, (t1 - t0).toFixed(2) + 'ms', 'result=', r);
}

// 参数相对保守，便于本地快速验证
const N = 9_000_000;

for (let index = 1; index < 5; index++) {
  measure('cold'+ index, () => hotFn(N));
  for (let i = 0; i < 3; i++) hotFn(N);
  measure('warm' + index, () => hotFn(N));
}

// node --cpu-prof month-01-core-fundamentals/notes/scripts/demo-jit-warmup.js
// cold1 9.55ms result= 40499995500000
// warm1 7.67ms result= 40499995500000
// cold2 7.63ms result= 40499995500000
// warm2 8.65ms result= 40499995500000
// cold3 8.32ms result= 40499995500000
// warm3 7.32ms result= 40499995500000
// cold4 6.95ms result= 40499995500000
// warm4 7.55ms result= 40499995500000
module.exports = {};
