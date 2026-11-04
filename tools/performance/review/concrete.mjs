// Compare equivalent scalar f64 kernels on the concrete ledger only. Material parameters
// come from the production resolver. Production's full ledger provides the numerical reference.
import assert from 'node:assert/strict'
import { readFileSync,writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const project = require('@pm/project'), geom = require('@pm/geometry'), analysis = require('@pm/analysis')
const { buildPreviewSurfaceFallback } = require('../../../apps/web/application/analysis/fallback.ts')
const { buildResistanceMaterialSets } = require('@pm/design')
const { resolveEc2ParabolicRectangularParams } = require('@pm/materials')
const dir = process.env.PM_PERF_OUTPUT ?? 'outputs/performance-review'
const p = project.parseProjectDocument(readFileSync(dir + '/en-L.pm-project.json','utf8'))
assert.ok(p.ok)
const i = p.document.inputs
const section = geom.sectionGeometryFromGeometryInput(i.geometry), rebars = geom.geometryInputRebars(i.geometry)
const materials = buildResistanceMaterialSets(i.materials,i.design).stateMaterials
const prepared = analysis.prepareAnalysis(section,rebars,materials,project.analysisMeshKernelOptions(i.analysis))
const { surface } = buildPreviewSurfaceFallback({section,rebars,materialStore:i.materials,designBasis:i.design,
  calculationProfileId:i.calculationProfileId,analysisOptions:i.analysis})
const {epsC2,epsCu2,peak,n,ignoreTension} = resolveEc2ParabolicRectangularParams(materials.concrete)
assert.equal(materials.concrete.stressStrain.type,'ec2-parabolic-rectangular')
assert.equal(n,2)
assert.ok(ignoreTension)
const states = Array.from({length:256},(_,k)=>surface.points[Math.floor(k*(surface.points.length-1)/255)].state)
const s = new Float64Array(states.flatMap(v=>[v.e0,v.kx,v.ky]))
const pack = () => new Float64Array(prepared.concreteFibers.flatMap(v=>[v.x,v.y,v.area]))
const f = pack(), js = new Float64Array(s.length), copied = new Float64Array(s.length)
const add = (sums,k,v) => {
  const previous = sums[k], next = previous + v
  sums[k+3] += Math.abs(previous)>=Math.abs(v) ? (previous-next)+v : (v-next)+previous
  sums[k] = next
}
function runJS() {
  const sums = new Float64Array(6)
  for (let j=0;j<s.length;j+=3) {
    sums.fill(0)
    for (let t=0;t<f.length;t+=3) {
      const strain=s[j]+s[j+1]*f[t+1]+s[j+2]*f[t]
      let stress=0
      if (strain>0 && strain<=epsCu2) {
        const r=1-strain/epsC2
        stress=strain<=epsC2 ? peak*(1-r*r) : peak
      }
      const force=stress*f[t+2]
      add(sums,0,force); add(sums,1,force*f[t+1]); add(sums,2,force*f[t])
    }
    for (let k=0;k<3;k++) js[j+k]=sums[k]+sums[k+3]
  }
}
const binary=readFileSync(dir+'/concrete.wasm')
const t0=performance.now()
const {instance} = await WebAssembly.instantiate(binary)
const instantiateMs=performance.now()-t0
const {memory,__heap_base:base,integrate}=instance.exports
const fp=Math.ceil(base.value/8)*8, sp=fp+f.byteLength, op=sp+s.byteLength
const size=op+js.byteLength
if (size>memory.buffer.byteLength) memory.grow(Math.ceil((size-memory.buffer.byteLength)/65536))
new Float64Array(memory.buffer,fp,f.length).set(f)
const wasmStates=new Float64Array(memory.buffer,sp,s.length), wasmResult=new Float64Array(memory.buffer,op,js.length)
function runWasm() {
  wasmStates.set(s)
  integrate(fp,f.length/3,sp,s.length/3,epsC2,epsCu2,peak,op)
  copied.set(wasmResult)
}
const timed = fn => { const t=performance.now(); fn(); return performance.now()-t }
const jsMs=[],wasmMs=[]
for (let k=0;k<13;k++) {
  const pair=k%2 ? [timed(runJS),timed(runWasm)] : [timed(runWasm),timed(runJS)].reverse()
  if(k>=2) { jsMs.push(pair[0]); wasmMs.push(pair[1]) }
}
const reference=new Float64Array(states.flatMap(state=>{
  const {P,Mx,My}=analysis.evaluatePreparedState(prepared,state).concrete
  return [P,Mx,My]
}))
assert.deepEqual(js,reference)
assert.deepEqual(copied,reference)
const median=ms=>ms.toSorted((a,b)=>a-b)[Math.floor(ms.length/2)]
const result={fibres:f.length/3,states:states.length,ordinates:reference.length,triangleOrFibreBytes:f.byteLength,
  wasmBytes:binary.length,instantiateMs,packMs:median(Array.from({length:7},()=>timed(pack))),
  jsMs,wasmMs,jsMedian:median(jsMs),wasmMedian:median(wasmMs)}
writeFileSync(dir+'/concrete.json',JSON.stringify(result,null,2))
console.log(result)
