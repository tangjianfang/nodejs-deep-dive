const { performance } = require('node:perf_hooks');

function A() { this.v = 1; }
function B() { this.v = 2; this.extra = 0; }

function call(o) { return o.v; }

function runScenario(arr, label) {
  for (let i = 0; i < 10000; i++) call(arr[i % arr.length]);

  const t0 = performance.now();
  let s = 0;
  for (let i = 0; i < 200000; i++) s += call(arr[i % arr.length]);
  const t1 = performance.now();
  console.log(label, 'time=', (t1 - t0).toFixed(2) + 'ms', 'sum=', s);
}

const mono = Array.from({ length: 100 }, () => new A());
const poly = Array.from({ length: 100 }, (_, i) => (i % 2 ? new A() : new B()));

runScenario(mono, 'monomorphic');
runScenario(poly, 'polymorphic');

module.exports = {};
