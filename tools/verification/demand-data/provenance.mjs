/** Trace every nominal demand-plane point back to an exact surface vertex or crossed edge. */
import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { parseProjectDocument } from '@pm/project'
import { geometryInputRebars, sectionGeometryFromGeometryInput } from '@pm/geometry'
import { activeNominalSurfaceDataset, sliceMomentPlane } from '@pm/analysis'
import { fromCanonical, UNIT_PRESETS } from '@pm/units'

const require = createRequire(import.meta.url)
const { buildPreviewSurfaceFallback } = require('../../../apps/web/application/analysis/fallback.ts')
const file = 'docs/examples/realistic-sections/KDS-REAL-05-complex-stress-strain.pm-project.json'
const out = 'outputs/demand-point-provenance'
await mkdir(out, { recursive: true })
const parsed = parseProjectDocument(await readFile(file, 'utf8'))
assert.ok(parsed.ok)
const { geometry, materials, design, analysis, calculationProfileId, loadings } = parsed.document.inputs
const { surface } = buildPreviewSurfaceFallback({ calculationProfileId,
  section: sectionGeometryFromGeometryInput(geometry), rebars: geometryInputRebars(geometry),
  materialStore: materials, designBasis: design, analysisOptions: analysis })
const dataset = activeNominalSurfaceDataset(surface)
assert.ok(dataset.triangles)
const load = loadings.combinations[0]
// Reproduce the display adapter's degree normalization before its call to sliceMomentPlane.
const normalizeDegrees = degrees => ((degrees % 360) + 360) % 360
const thetaDegrees = normalizeDegrees(Math.atan2(load.My, load.Mx) * 180 / Math.PI)
const theta = normalizeDegrees(thetaDegrees) * Math.PI / 180
const c = Math.cos(theta), s = Math.sin(theta)
const distance = point => point.Mx * s - point.My * c
// This is the existing plane-classification criterion in sliceMomentPlane.
const planeTolerance = Math.max(1,...dataset.points.map(p => Math.hypot(p.Mx,p.My))) * 1e-12
const key = point => [point.P,point.Mx,point.My,point.station].map(value => Object.is(value,-0) ? '-0' : String(value)).join('|')
const candidates = new Map()
const add = (point, source) => {
  const k = key(point)
  if (!candidates.has(k)) candidates.set(k, source)
}
for (const [index, point] of dataset.points.entries()) {
  if (Math.abs(distance(point)) <= planeTolerance) add(point, { kind:'vertex', index })
}
for (const [triangleIndex, triangle] of dataset.triangles.entries()) {
  for (const [aIndex,bIndex] of [[triangle.a,triangle.b],[triangle.b,triangle.c],[triangle.c,triangle.a]]) {
    const a = dataset.points[aIndex], b = dataset.points[bIndex]
    const da = distance(a), db = distance(b)
    if (Math.abs(da) <= planeTolerance || Math.abs(db) <= planeTolerance || da * db > 0) continue
    const t = da / (da - db)
    const point = Object.fromEntries(['P','Mx','My','station'].map(name => [name, a[name] + (b[name]-a[name])*t]))
    add(point, { kind:'edge', triangleIndex, aIndex, bIndex, da, db, t,
      edgeType: a.station === b.station ? 'same-station' : a.beta === b.beta ? 'same-beta' : 'diagonal' })
  }
}
const paths = sliceMomentPlane(dataset.points,theta,dataset.triangles)
assert.equal(paths.length,1)
const rows = paths[0].points.map((point,index) => {
  const source = candidates.get(key(point))
  assert.ok(source, 'Every point must have an exact source coordinate match at index ' + index)
  return { ordinal:index+1, point, source,
    a: dataset.points[source.kind === 'vertex' ? source.index : source.aIndex],
    b: source.kind === 'edge' ? dataset.points[source.bIndex] : null,
    display: { P:fromCanonical('force',point.P,UNIT_PRESETS.metric),
      M:fromCanonical('moment',point.M,UNIT_PRESETS.metric),
      Mx:fromCanonical('moment',point.Mx,UNIT_PRESETS.metric),
      My:fromCanonical('moment',point.My,UNIT_PRESETS.metric) } }
})
const unique = rows.slice(0,-1)
assert.equal(rows.length,97)
assert.equal(key(rows[0].point),key(rows.at(-1).point))
const summary = { file, load, thetaDegrees, theta, cosine:c, sine:s,
  nominalPoints:dataset.points.length, triangles:dataset.triangles.length, directions:dataset.directions.length,
  stations:dataset.stations.length, plottedRows:rows.length, uniquePoints:unique.length,
  sourceCounts: unique.reduce((counts,row)=>{
    const kind = row.source.kind === 'vertex' ? row.a.surfaceRole : row.source.edgeType
    counts[kind]=(counts[kind]??0)+1
    return counts
  },{}) }
const columns = ['Point','Source','Edge type','A index','A beta deg','A station','A P (N)','A Mx (N mm)','A My (N mm)',
  'B index','B beta deg','B station','B P (N)','B Mx (N mm)','B My (N mm)','dA (N mm)','dB (N mm)','t',
  'P (kN)','Mx (kN m)','My (kN m)','Mtheta (kN m)']
const csvRow = values => values.map(v=>v == null ? '' : '"' + String(v).replaceAll('"','""') + '"').join(',')
const csvRows = rows.map(r=>[
  r.ordinal,r.source.kind,r.source.edgeType,r.source.index??r.source.aIndex,r.a.beta*180/Math.PI,r.a.stationId??r.a.station,
  r.a.P,r.a.Mx,r.a.My,r.source.bIndex,r.b?.beta*180/Math.PI,r.b?.stationId??r.b?.station,
  r.b?.P,r.b?.Mx,r.b?.My,r.source.da,r.source.db,r.source.t,
  r.display.P,r.display.Mx,r.display.My,r.display.M
])
await writeFile(out+'/nominal-97.csv',[csvRow(columns),...csvRows.map(csvRow)].join('\n')+'\n')
await writeFile(out+'/nominal-97.json',JSON.stringify({summary,rows},null,2))
console.log(JSON.stringify({summary, examples: rows.slice(0,4).map(r=>({ordinal:r.ordinal,source:r.source,
  a:{beta:r.a.beta*180/Math.PI,station:r.a.station,P:r.a.P,Mx:r.a.Mx,My:r.a.My},
  b:r.b?{beta:r.b.beta*180/Math.PI,station:r.b.station,P:r.b.P,Mx:r.b.Mx,My:r.b.My}:null,display:r.display}))},null,2))
