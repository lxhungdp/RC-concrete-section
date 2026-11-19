// Benchmark-only A/B. Inputs come from production surfaces and production crossings in workflows.mjs.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
const dir = 'outputs/performance-review'
const wasm = readFileSync(dir + '/ray.wasm')
const start = performance.now()
const { instance } = await WebAssembly.instantiate(wasm)
const { memory, __heap_base: base, scan } = instance.exports
const result = { wasmBytes: wasm.length, firstInstantiateMs: performance.now() - start, cases: [] }

const dot = (a,b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2]
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]
function pack({forceScale, momentScale, points, triangles}) {
  const normalized = points.map(p => [p[0]/forceScale, p[1]/momentScale, p[2]/momentScale])
  const buffer = new Float64Array(triangles.length * 14)
  for (const [i, [a,b,c]] of triangles.entries()) {
    const s = normalized[a].map(x => 0 - x)
    const e1 = normalized[b].map((x,k) => x - normalized[a][k])
    const e2 = normalized[c].map((x,k) => x - normalized[a][k])
    const q = cross(s,e1)
    const cap = points[a][0] === points[b][0] && points[a][0] === points[c][0] ? points[a][0] : NaN
    buffer.set([...s,...e1,...e2,...q,dot(e2,q),cap], 14*i)
  }
  return buffer
}
function scanJS(tri, demands, out) {
  for (let j = 0; j < demands.length; j += 4) {
    const dx = demands[j], dy = demands[j+1], dz = demands[j+2]
    let best = Infinity, index = -1, bestU = 0, bestV = 0
    for (let t = 0; t < tri.length; t += 14) {
      const hx = dy*tri[t+8] - dz*tri[t+7]
      const hy = dz*tri[t+6] - dx*tri[t+8]
      const hz = dx*tri[t+7] - dy*tri[t+6]
      const det = tri[t+3]*hx + tri[t+4]*hy + tri[t+5]*hz
      if (Math.abs(det) < 1e-12) continue
      const inv = 1/det
      const u = inv*(tri[t]*hx + tri[t+1]*hy + tri[t+2]*hz)
      if (u < -1e-9 || u > 1+1e-9) continue
      const v = inv*(dx*tri[t+9] + dy*tri[t+10] + dz*tri[t+11])
      if (v < -1e-9 || u+v > 1+1e-9) continue
      const cap = tri[t+13]
      const lambda = !Number.isNaN(cap) && demands[j+3] !== 0 ? cap/demands[j+3] : inv*tri[t+12]
      if (lambda > 1e-10 && lambda < best) { best = lambda; index = t/14; bestU = u; bestV = v }
    }
    out[j] = best; out[j+1] = index; out[j+2] = bestU; out[j+3] = bestV
  }
}
const timed = fn => { const start = performance.now(); fn(); return performance.now() - start }
const median = xs => xs.toSorted((a,b)=>a-b)[Math.floor(xs.length/2)]
for (const file of readdirSync(dir).filter(f => f.endsWith('-rays.json'))) {
  const fixture = JSON.parse(readFileSync(dir + '/' + file), (_k,v) => v === '-0' ? -0 : v)
  const tri = pack(fixture)
  const demands = new Float64Array(fixture.demands.flatMap(({ d: [p,mx,my] }) =>
    [p/fixture.forceScale, mx/fixture.momentScale, my/fixture.momentScale, p]))
  const js = new Float64Array(demands.length)
  const triPtr = Math.ceil(base.value/8)*8
  const loadPtr = triPtr + tri.byteLength
  const outPtr = loadPtr + demands.byteLength
  const size = outPtr + js.byteLength
  if (size > memory.buffer.byteLength) memory.grow(Math.ceil((size - memory.buffer.byteLength)/65536))
  const wasmTri = new Float64Array(memory.buffer, triPtr, tri.length)
  const wasmLoads = new Float64Array(memory.buffer, loadPtr, demands.length)
  const wasmResult = new Float64Array(memory.buffer, outPtr, js.length)
  const upload = () => wasmTri.set(tri)
  upload()
  const copied = new Float64Array(js.length)
  const runWasm = () => {
    wasmLoads.set(demands)
    scan(triPtr, fixture.triangles.length, loadPtr, fixture.demands.length, outPtr)
    copied.set(wasmResult)
  }
  const runJS = () => scanJS(tri, demands, js)
  const jsMs = [], wasmMs = []
  for (let i = 0; i < 13; i++) {
    // Alternate the execution order and discard both warm-up rounds.
    const pair = i%2 ? [timed(runJS), timed(runWasm)] : [timed(runWasm), timed(runJS)].reverse()
    if (i >= 2) { jsMs.push(pair[0]); wasmMs.push(pair[1]) }
  }
  assert.deepEqual(copied, js)
  for (const [i, { expected }] of fixture.demands.entries()) {
    const [lambda, index, u, v] = js.subarray(i*4,i*4+4)
    if (expected === null) { assert.equal(index, -1); continue }
    assert.deepEqual([lambda,1-u-v,u,v,...fixture.triangles[index]], expected)
  }
  result.cases.push({file, n: fixture.demands.length, triangleBytes: tri.byteLength,
    packMs: median(Array.from({length:7},()=>timed(()=>pack(fixture)))),
    surfaceUploadMs: median(Array.from({length:7},()=>timed(upload))),
    jsMs, wasmMs, jsMedian: median(jsMs), wasmMedian: median(wasmMs)})
}
assert.equal(result.cases.length, 4)
writeFileSync(dir + '/ray.json', JSON.stringify(result,null,2))
console.table(result.cases.map(({file,n,jsMedian,wasmMedian,packMs})=>({file,n,jsMedian,wasmMedian,packMs})))
