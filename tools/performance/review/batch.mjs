// End-to-end differential experiment. Compile two private copies of the same kernel.
// Rewrites deliberately fail if the source layout changes. No application module is modified.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { compileFunction } from 'node:vm'
import { readFileSync,writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { createHash } from 'node:crypto'
const require = createRequire(import.meta.url)
const { transformSync } = require('esbuild')
const { parseProjectDocument } = require('@pm/project')
const { geometryInputRebars,sectionGeometryFromGeometryInput } = require('@pm/geometry')
const { buildPreviewSurfaceFallback } = require('../../../apps/web/application/analysis/fallback.ts')
const production = require('@pm/analysis')
const dir = process.env.PM_PERF_OUTPUT ?? 'outputs/performance-review'
const loadCount = Number(process.env.PM_REVIEW_LOAD_COUNT ?? 100)
assert.ok(Number.isInteger(loadCount) && loadCount > 0 && loadCount <= 100)
const distinctOnly = process.env.PM_REVIEW_DISTINCT_ONLY === '1'
const repeats = loadCount < 100 ? 15 : 5
const reportName = loadCount === 100 && !distinctOnly ? 'batch.json' :
  'batch-' + loadCount + (distinctOnly ? '-distinct' : '') + '.json'
const file = require.resolve('@pm/analysis')
const original = readFileSync(file,'utf8')
const replaceOnce = (s, a, b) => {
  assert.equal(s.split(a).length,2,'Expected one source anchor: ' + a)
  return s.replace(a,b)
}
function variant() {
  const start = 'const previewSurfaceTriangles = ('
  let s = replaceOnce(original,start,`
let currentBatch
function previewSurfaceTriangles(points, topology) {
  if (!currentBatch || !topology) return assembleTriangles(points, topology)
  let byTopology = currentBatch.triangles.get(points)
  if (!byTopology) { byTopology = new Map(); currentBatch.triangles.set(points, byTopology) }
  if (!byTopology.has(topology)) byTopology.set(topology, assembleTriangles(points, topology))
  return byTopology.get(topology)
}
function batchContour(surface, p) {
  if (!currentBatch) return sliceActiveDesignPContour(surface, p)
  if (!Object.is(p, currentBatch.p) || currentBatch.contour === undefined) {
    currentBatch.contour = sliceActiveDesignPContour(surface, p)
    currentBatch.p = p
  }
  return currentBatch.contour
}
const assembleTriangles = (`)
  s = replaceOnce(s,'const contour = sliceActiveDesignPContour(surface, loadcase.P)',
    'const contour = batchContour(surface, loadcase.P)')
  return replaceOnce(s,'): LoadcaseQuickCheckResult[] => loadcases.map((loadcase) => checkLoadcaseUtilizationFromSurface(surface, loadcase, checkBasis))',`
): LoadcaseQuickCheckResult[] => {
  currentBatch = { triangles: new Map() }
  try { return loadcases.map(loadcase => checkLoadcaseUtilizationFromSurface(surface, loadcase, checkBasis)) }
  finally { currentBatch = undefined }
}`)
}
function compile(src) {
  const { code } = transformSync(src,{loader:'ts',format:'cjs',target:'es2022',sourcefile:file})
  const mod = {exports:{}}
  compileFunction(code,['require','module','exports','__filename','__dirname'],{filename:file})(
    createRequire(file),mod,mod.exports,file,dirname(file))
  return mod.exports.checkLoadcasesUtilizationFromSurface
}
const baseline = compile(original), candidate = compile(variant())
const result = {kernelSha256:createHash('sha256').update(original).digest('hex'),repeats,cases:[]}
const timed = f => { const t=performance.now(); f(); return performance.now()-t }
const median = v => v.toSorted((a,b)=>a-b)[Math.floor(v.length/2)]
for (const label of ['kds-complex','kds-block','en-L','as-hollow']) {
  const p = parseProjectDocument(readFileSync(dir+'/'+label+'.pm-project.json','utf8'))
  assert.ok(p.ok)
  const i = p.document.inputs
  const {surface} = buildPreviewSurfaceFallback({section:sectionGeometryFromGeometryInput(i.geometry),rebars:geometryInputRebars(i.geometry),
    materialStore:i.materials,designBasis:i.design,calculationProfileId:i.calculationProfileId,analysisOptions:i.analysis})
  const combinations = i.loadings.combinations
  assert.ok(combinations.length >= loadCount)
  const selected = Array.from({length:loadCount},(_,k)=>
    combinations[Math.floor(k * combinations.length / loadCount)])
  for (const shared of distinctOnly ? [false] : [false,true]) {
    const batch = selected.map(x=> shared ? {...x,P:combinations[55].P} : x)
    for (const basis of ['proportional3D','constantAxial']) {
      const args = [surface,batch,basis]
      const truth = production.checkLoadcasesUtilizationFromSurface(...args)
      assert.deepEqual(baseline(...args),truth)
      assert.deepEqual(candidate(...args),truth)
      const current = [], optimized = []
      for (let j=0;j<repeats;j++) {
        const a=()=>current.push(timed(()=>baseline(...args)))
        const b=()=>optimized.push(timed(()=>candidate(...args)))
        if (j%2) { b(); a() } else { a(); b() }
      }
      result.cases.push({label,shared,basis,loads:batch.length,current,optimized,baselineMs:median(current),candidateMs:median(optimized)})
    }
  }
  writeFileSync(dir+'/'+reportName,JSON.stringify(result,null,2))
  console.log('Verified batch',label)
}
