// Run from the repository root with node --import tsx. All artifacts are local to outputs/.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { serialize } from 'node:v8'
import { Session } from 'node:inspector/promises'

const require = createRequire(import.meta.url)
const project = require('@pm/project')
const geometry = require('@pm/geometry')
const analysis = require('@pm/analysis')
const { buildPreviewSurfaceFallback, checkLoadcaseFallback, buildExactDirectionFallback, buildSectionFieldMapFallback } =
  require('../../../apps/web/application/analysis/fallback.ts')
const { buildColumnReportModel } = require('@pm/report/report-model')
const { renderColumnReport } = require('@pm/report/pdf')
const { buildDemandCheckWorkbookBytes } = require('@pm/report')
const output = process.env.PM_PERF_OUTPUT ?? 'outputs/performance-review'
mkdirSync(output, { recursive: true })
const digest = (data) => createHash('sha256').update(data).digest('hex')

const workloads = [
  ['kds-complex', 'realistic-sections/KDS-REAL-05-complex-stress-strain', null, 'fixed'],
  ['kds-block', 'equivalent-block/KDS-EB-01-rectangle-8-bars', null, 'fixed'],
  ['en-L', 'equivalent-block/KDS-EB-03-l-shape-8-bars', 'en-1992-1-1-2004-stress-strain', 'adaptive'],
  ['as-hollow', 'equivalent-block/KDS-EB-02-hollow-8-bars', 'as-3600-2018-amd2-equivalent-block', 'adaptive']
]
const baseInput = (file, override, mode) => {
  const parsed = project.parseProjectDocument(readFileSync('docs/examples/' + file + '.pm-project.json', 'utf8'))
  assert.ok(parsed.ok)
  const { inputs } = parsed.document
  const id = override ?? inputs.calculationProfileId
  const block = project.isEquivalentBlockProfileId(id)
  return {
    section: geometry.sectionGeometryFromGeometryInput(inputs.geometry),
    rebars: geometry.geometryInputRebars(inputs.geometry),
    calculationProfileId: id,
    materialStore: override ? project.applyCalculationProfileToMaterials(inputs.materials, id) : inputs.materials,
    designBasis: override ? project.createDesignBasisForCalculationProfile(id) : inputs.design,
    analysisOptions: mode === 'adaptive' ? (block ? project.createAdaptiveEquivalentBlockAnalysisOptions() :
      project.createAdaptiveAnalysisOptions()) : project.createAnalysisOptionsForProfile(id)
  }
}
const elapsed = async (fn, repeats = 3) => {
  let value = await fn()
  const ms = []
  for (let i = 0; i < repeats; i++) {
    const start = performance.now()
    value = await fn()
    ms.push(performance.now() - start)
  }
  const sorted = [...ms].sort((a, b) => a - b)
  return { value, stats: { ms, median: sorted[Math.floor(sorted.length / 2)] } }
}
const makeLoads = (surface, commonP) => Array.from({ length: 100 }, (_, i) => {
  const { P, Mx, My } = surface.bounds
  const fraction = commonP ? 0.55 : 0.06 + 0.88 * (i + 0.5) / 100
  const theta = i * 2.399963229728653
  return project.createLoadCombination({ id: i + 1, name: 'LC ' + (i + 1),
    P: P[0] + fraction * (P[1] - P[0]),
    Mx: 0.32 * (Mx[1] - Mx[0]) * Math.cos(theta),
    My: 0.32 * (My[1] - My[0]) * Math.sin(theta) })
})
async function sampleCpu(fn) {
  const session = new Session()
  session.connect()
  try {
    await session.post('Profiler.enable')
    await session.post('Profiler.start')
    await fn()
    const { profile } = await session.post('Profiler.stop')
    const byId = new Map(profile.nodes.map(n => [n.id, n.callFrame]))
    const totals = new Map()
    for (const [i, id] of profile.samples.entries()) {
      const f = byId.get(id)
      const key = (f.functionName || '(anonymous)') + ' ' + f.url.split('/').slice(-3).join('/')
      totals.set(key, (totals.get(key) ?? 0) + profile.timeDeltas[i] / 1000)
    }
    return [...totals].sort((a,b) => b[1] - a[1]).slice(0, 10)
  } finally { session.disconnect() }
}
const results = { node: process.version, v8: process.versions.v8, cases: [] }
for (const [label, file, profile, mode] of workloads) {
  const input = baseInput(file, profile, mode)
  const r = { label, profileId: input.calculationProfileId, mode, stages: {}, checks: {} }
  const record = async (name, fn, n) => {
    const measured = await elapsed(fn, n)
    r.stages[name] = measured.stats
    return measured.value
  }
  const build = () => buildPreviewSurfaceFallback(input).surface
  const surface = await record('buildWithWarmPreparation', build)
  r.surface = { points: surface.points.length, triangles: surface.triangles.length,
    serializedBytes: serialize(surface).byteLength, stationsConverged: surface.stationError.withinTolerance,
    directionsConverged: surface.directionError.withinTolerance }
  await record('structuredClone', () => structuredClone(surface))
  const loads = makeLoads(surface, false)
  for (const commonP of [false, true]) {
    const batch = commonP ? makeLoads(surface, true) : loads
    const group = commonP ? 'common' : 'distinct'
    for (const basis of ['proportional3D', 'constantAxial']) {
      const checkBatch = () => analysis.checkLoadcasesUtilizationFromSurface(surface, batch, basis)
      const checks = await record(group + '-' + basis, checkBatch)
      r.checks[group + '-' + basis] = {
        hash: digest(JSON.stringify(checks)),
        verdicts: checks.reduce((v,c) => ({ ...v, [c.adequacy]: (v[c.adequacy] ?? 0) + 1 }), {}) }
    }
    if (commonP) {
      const buildContour = () => analysis.sliceActiveDesignPContour(surface, batch[0].P)
      const uncached = await record('commonContour100', () => batch.map(buildContour))
      const reused = await record('commonContourBuiltOnce', () => {
        const contour = buildContour()
        return batch.map(() => contour)
      })
      for (const c of uncached) assert.deepEqual(c, reused[0])
    }
  }
  await record('productionRay100', () => loads.map(d => analysis.intersectSurfaceWithDemandRay(surface, d)))
  await record('oneProportional', () => analysis.checkLoadcaseUtilizationFromSurface(surface, loads[50], 'proportional3D'))
  await record('exactDirection', () => buildExactDirectionFallback({ ...input, beta: 0.37 }))
  const { analysisOptions: _options, ...detailInput } = input
  const detail = { ...detailInput, surface, loadcase: loads[50], checkBasis: 'proportional3D' }
  if (project.isEquivalentBlockProfileId(input.calculationProfileId)) {
    await record('fallbackFullKey', () => JSON.stringify(detail))
    await record('fallbackPreparationFieldsKey', () => JSON.stringify(detailInput))
  }
  const inverse = await record('detailFallback', () => checkLoadcaseFallback(detail))
  r.detail = { ok: inverse.ok, converged: inverse.converged, capacityField: inverse.capacityField?.status }
  if (inverse.ok && (!project.isEquivalentBlockProfileId(input.calculationProfileId) || inverse.equivalentBlock)) {
    await record('fieldFromResolvedState', () => buildSectionFieldMapFallback({
      ...input, state: inverse.state, blockState: inverse.equivalentBlock ?? undefined }))
  }
  if (label === 'kds-block' || label === 'kds-complex') {
    const report = { ...input, surface, loadcases: loads.slice(46,50), detailLoadcaseIds: [49], checkBasis: 'proportional3D',
      projectName: 'Performance fixture', sectionName: input.section.name, projectInformation: project.createDefaultProjectInformation() }
    const model = await record('reportModel4loads1detail', () => buildColumnReportModel(report))
    const unicodeFontBytes = readFileSync('apps/web/public/fonts/PMReportUnicode-Regular.ttf')
    const pdf = await record('renderPDF', () => renderColumnReport(model, { unicodeFontBytes }))
    const workbook = await record('buildXLSX4loads1detail', () => buildDemandCheckWorkbookBytes(report))
    r.exportBytes = { pdf: pdf.length, xlsx: workbook.length }
  }
  const { forceScale, momentScale } = {
    forceScale: Math.max(1,...surface.bounds.P.map(Math.abs)),
    momentScale: Math.max(1,...[...surface.bounds.Mx,...surface.bounds.My].map(Math.abs)) }
  const tri = surface.triangles.map(({ a,b,c }) => [a,b,c])
  const keys = new Map(surface.points.map((p,i) => [p,i]))
  const fixtures = { forceScale, momentScale, points: surface.points.map(p => [p.P,p.Mx,p.My]), triangles: tri,
    demands: [...loads, {P:0,Mx:1e6,My:0}, {P:1e6,Mx:0,My:0}, {P:-1e6,Mx:0,My:0}].map(d => {
      const hit = analysis.intersectSurfaceWithDemandRay(surface,d)
      return { d: [d.P,d.Mx,d.My], expected: hit ? [hit.lambda,...hit.source.weights,...hit.source.vertices.map(v=>keys.get(v))] : null }
    }) }
  // Signed zero on an axial boundary is observable with Object.is. JSON numbers lose it.
  writeFileSync(output + '/' + label + '-rays.json',
    JSON.stringify(fixtures, (_k,v) => Object.is(v, -0) ? '-0' : v))
  const original = project.parseProjectDocument(readFileSync('docs/examples/' + file + '.pm-project.json','utf8')).document
  const browserProject = project.createProjectDocument({ geometry: original.inputs.geometry, calculationProfileId: input.calculationProfileId,
    materials: input.materialStore, design: input.designBasis, analysis: input.analysisOptions,
    loadings: { combinations: loads, checkBasis: 'proportional3D' } })
  writeFileSync(output + '/' + label + '.pm-project.json', project.serializeProjectDocument(browserProject))
  if (label === 'as-hollow') r.cpuConstantP = await sampleCpu(() => analysis.checkLoadcasesUtilizationFromSurface(surface, loads, 'constantAxial'))
  results.cases.push(r)
  writeFileSync(output + '/workflows.json', JSON.stringify(results, null, 2))
  console.log(label, 'finished', r.surface.points, r.surface.triangles)
}
