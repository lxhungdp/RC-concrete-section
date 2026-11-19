// One fresh Node process per registered route/mode for comparable cold-build and peak RSS evidence.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire, findSourceMap } from 'node:module'
import { Session } from 'node:inspector/promises'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const project = require('@pm/project')
const dir = process.env.PM_PERF_OUTPUT ?? 'outputs/performance-review'
const [id, mode, appendix] = process.argv.slice(2)
if (!id) {
  const rows = []
  for (const profile of project.CALCULATION_PROFILES) {
    const annexes = profile.allowedDesignProfileIds?.includes('kds-142020-2022-appendix-material-factors') ?
      ['basic','appendix'] : ['basic']
    for (const annex of annexes) for (const sampling of ['fixed','adaptive']) {
      const child = spawnSync(process.execPath,['--expose-gc','--import','tsx',fileURLToPath(import.meta.url),profile.id,sampling,annex],{encoding:'utf8'})
      if (child.status !== 0) throw new Error(child.stderr || String(child.error))
      rows.push(JSON.parse(child.stdout))
      writeFileSync(dir+'/profiles.json', JSON.stringify(rows,null,2))
    }
  }
} else {
  const g = require('@pm/geometry'), design = require('@pm/design'), a = require('@pm/analysis')
  const { buildPreviewSurfaceFallback } = require('../../../apps/web/application/analysis/fallback.ts')
  const p = project.parseProjectDocument(readFileSync('docs/examples/equivalent-block/KDS-EB-01-rectangle-8-bars.pm-project.json','utf8'))
  assert.ok(p.ok)
  const i = p.document.inputs
  const input = { section:g.sectionGeometryFromGeometryInput(i.geometry),rebars:g.geometryInputRebars(i.geometry),
    calculationProfileId:id, materialStore:project.applyCalculationProfileToMaterials(i.materials,id),
    designBasis:appendix === 'appendix' ? design.createKdsAppendixDesignBasis() : project.createDesignBasisForCalculationProfile(id),
    analysisOptions:mode === 'fixed' ? project.createAnalysisOptionsForProfile(id) :
      project.isEquivalentBlockProfileId(id) ? project.createAdaptiveEquivalentBlockAnalysisOptions() : project.createAdaptiveAnalysisOptions() }
  global.gc()
  const initial = process.memoryUsage()
  const profiler = process.argv.includes('--cpu') ? new Session() : null
  if (profiler) {
    profiler.connect()
    await profiler.post('Profiler.enable')
    await profiler.post('Profiler.start')
  }
  const t = performance.now()
  const {surface} = buildPreviewSurfaceFallback(input)
  const buildMs = performance.now()-t
  const peakKiB = process.resourceUsage().maxRSS
  if (profiler) {
    const { profile } = await profiler.post('Profiler.stop')
    profiler.disconnect()
    const nodes = new Map(profile.nodes.map(n => [n.id,n]))
    const totals = new Map()
    for (const [i,id] of profile.samples.entries()) {
      const f = nodes.get(id).callFrame
      const loc = findSourceMap(f.url)?.findEntry(f.lineNumber,f.columnNumber)
      const key = [f.functionName || '(anonymous)', (loc?.originalSource ?? f.url).split('/').slice(-4).join('/'),
        (loc?.originalLine ?? f.lineNumber)+1].join(' ')
      totals.set(key,(totals.get(key)??0)+profile.timeDeltas[i]/1000)
    }
    writeFileSync(dir+'/cpu-'+id+'.json',JSON.stringify([...totals].sort((a,b)=>b[1]-a[1]),null,2))
  }
  global.gc()
  const heapDelta = process.memoryUsage().heapUsed - initial.heapUsed
  const loads = Array.from({length:100},(_,k) => project.createLoadCombination({
    id:k+1, name:'LC '+(k+1), P:surface.bounds.P[0]+(surface.bounds.P[1]-surface.bounds.P[0])*(k+0.5)/100,
    Mx:0.28*(surface.bounds.Mx[1]-surface.bounds.Mx[0])*Math.cos(k),
    My:0.28*(surface.bounds.My[1]-surface.bounds.My[0])*Math.sin(k) }))
  const batch = {}
  for (const basis of ['proportional3D','constantAxial']) {
    const before = performance.now()
    const checks = a.checkLoadcasesUtilizationFromSurface(surface, loads, basis)
    batch[basis] = {ms:performance.now()-before, counts:checks.reduce((v,c)=>{
      v[c.adequacy]=(v[c.adequacy]??0)+1; return v
    },{})}
  }
  console.log(JSON.stringify({id,mode,appendix,buildMs,peakKiB,initialRSS:initial.rss,heapDelta,batch,
    points:surface.points.length, triangles:surface.triangles.length,
    stationError:surface.stationError,directionError:surface.directionError}))
}
