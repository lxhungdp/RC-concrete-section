import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { geometryInputRebars, prepareGroupedPointSupports, sectionGeometryFromGeometryInput } from '@pm/geometry'
import { buildResistanceMaterialSets, withSteelModelModification } from '@pm/design'
import { buildDesignPreviewSurfaceFromPrepared, prepareAnalysis } from '@pm/analysis'
import { parseProjectDocument } from '@pm/project'
import { buildColumnReportPdf } from '@pm/report/pdf'

const main = async () => {
const directory = 'outputs/steel-hardening'
await mkdir(directory, { recursive: true })
const measurements = []
for (const bars of [16, 128, 512]) for (const grades of [1, 2, 8]) {
  const points = Array.from({ length: bars }, (_, index) => ({ id: index, grade: index % grades,
    x: Math.sin(index * 17.3) * 300, y: Math.cos(index * 3.7) * 400 }))
  const start = performance.now()
  const supports = prepareGroupedPointSupports(points, (point) => String(point.grade))
  const directions = Array.from({ length: 36 }, (_, index) => ({ x: Math.sin(index * Math.PI / 18), y: Math.cos(index * Math.PI / 18) }))
  for (const direction of directions) supports(direction.x, direction.y)
  const prepareMs = performance.now() - start
  // Independent exhaustive extrema, including the original strain evaluation order.
  for (const direction of directions) for (const group of supports(direction.x, direction.y)) {
    const strain = (point: typeof points[number]) => -0.003 + 0.00001 * direction.y * point.y + 0.00001 * direction.x * point.x
    const all = points.filter((point) => String(point.grade) === group.groupId).map(strain)
    assert.ok(Math.abs(strain(group.minimum) - Math.min(...all)) < 1e-17)
    assert.ok(Math.abs(strain(group.maximum) - Math.max(...all)) < 1e-17)
  }
  const batch = (grouped: boolean) => {
    let checksum = 0
    const started = performance.now()
    for (let repeat = 0; repeat < 100; repeat += 1) for (const direction of directions) for (let station = 0; station < 34; station += 1) {
      const e0 = -station * 0.001
      const strain = (point: typeof points[number]) => e0 + 0.00001 * direction.y * point.y + 0.00001 * direction.x * point.x
      if (grouped) {
        for (const group of supports(direction.x, direction.y)) checksum += strain(group.minimum) + strain(group.maximum)
      } else {
        const minima = Array<number>(grades).fill(Number.POSITIVE_INFINITY)
        const maxima = Array<number>(grades).fill(Number.NEGATIVE_INFINITY)
        for (const point of points) {
          const value = strain(point)
          minima[point.grade] = Math.min(minima[point.grade], value)
          maxima[point.grade] = Math.max(maxima[point.grade], value)
        }
        for (let grade = 0; grade < grades; grade += 1) checksum += minima[grade] + maxima[grade]
      }
    }
    return { ms: performance.now() - started, checksum }
  }
  const exhaustive = batch(false)
  const grouped = batch(true)
  assert.equal(grouped.checksum, exhaustive.checksum)
  measurements.push({ bars, grades, directions: 36, stations: 34, repetitions: 100, prepareMs,
    strainEvaluationsPerPlane: { exhaustive: bars, grouped: 2 * grades }, exhaustiveMs: exhaustive.ms, groupedMs: grouped.ms,
    note: 'Support-check microbenchmark only; force/moment integration still evaluates every bar.' })
  assert.ok(Number.isFinite(exhaustive.checksum))
}

const source = JSON.parse(await readFile(`${directory}/en-1992-1-1-2004-stress-strain.json`, 'utf8'))
const first = source.inputs.materials.steel[0]
source.inputs.materials.steel.push({ ...structuredClone(first), id: 2, name: 'Synthetic lower-ductility grade', fy: 500,
  stressStrain: { type: 'linear-hardening', ultimateStrength: { type: 'stress', stress: 575 }, epsUk: 0.025, strainLimit: { type: 'factor', value: 0.9 } } })
source.inputs.geometry.rebars.forEach((bar: { steelMaterialId: number }, index: number) => { bar.steelMaterialId = index % 2 + 1 })
const parsed = parseProjectDocument(source)
assert.ok(parsed.ok, parsed.ok ? '' : parsed.error)
const { document } = parsed
const { geometry, materials, analysis } = document.inputs
assert.equal(analysis.methodId, 'strain-domain-surface-v1')
if (analysis.methodId !== 'strain-domain-surface-v1') throw new Error('The report fixture must use fibre mechanics.')
const basis = withSteelModelModification(document.inputs.design, materials)
const section = sectionGeometryFromGeometryInput(geometry)
const rebars = geometryInputRebars(geometry)
const started = performance.now()
const prepared = prepareAnalysis(section, rebars, buildResistanceMaterialSets(materials, basis).stateMaterials)
const preparedMs = performance.now() - started
const surfaceStart = performance.now()
const surface = buildDesignPreviewSurfaceFromPrepared(prepared, materials, basis, analysis)
const surfaceMs = performance.now() - surfaceStart
const reportStart = performance.now()
const font = new Uint8Array(await readFile('apps/web/public/fonts/PMReportUnicode-Regular.ttf'))
const report = buildColumnReportPdf({ projectName: 'Immediate steel hardening verification', projectInformation: document.meta.information,
  sectionName: geometry.name, calculationProfileId: document.inputs.calculationProfileId, section, rebars,
  materialStore: materials, designBasis: basis, analysisOptions: analysis, surface,
  loadcases: document.inputs.loadings.combinations, detailLoadcaseIds: document.inputs.loadings.combinations.map((load) => load.id) }, { unicodeFontBytes: font })
assert.ok(report.model.steelMaterial.some(([key]) => key === 'Steel 2 Design Eh'))
assert.ok(report.model.status.startsWith('PREVIEW'))
await writeFile(`${directory}/mixed-grade-hardening.pdf`, report.bytes)
await writeFile(`${directory}/performance-evidence.json`, JSON.stringify({ runtime: process.version, platform: process.platform,
  supportChecks: measurements, pipeline: { bars: rebars.length, preparedMs, surfaceMs, reportMs: performance.now() - reportStart,
    surfacePoints: surface.points.length, peakProcessRssKiB: process.resourceUsage().maxRSS,
    note: 'One end-to-end sample; no before/after speedup claim.' } }, null, 2))
console.log(JSON.stringify({ supportCases: measurements.length, reportBytes: report.bytes.length, preparedMs, surfaceMs }))
}

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1 })
