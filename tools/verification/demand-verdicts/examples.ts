import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { geometryInputRebars, sectionGeometryFromGeometryInput } from '@pm/geometry'
import { checkLoadcasesUtilizationFromSurface } from '@pm/analysis'
import { createAdaptiveAnalysisOptions, createAdaptiveEquivalentBlockAnalysisOptions,
  createAnalysisOptionsForProfile, parseProjectDocument } from '@pm/project'
import { buildPreviewSurfaceFallback, checkLoadcasesFallback } from '../../../apps/web/application/analysis/fallback'
import { intervalVerdict } from '../../../apps/web/test/support/demand-verdicts'

const files = readdirSync('docs/examples', { recursive: true }).filter((file): file is string =>
  typeof file === 'string' && file.endsWith('.pm-project.json'))
const records = []
for (const file of files) {
  const parsed = parseProjectDocument(readFileSync(join('docs/examples', file), 'utf8'))
  assert.ok(parsed.ok, file)
  const { geometry, materials, design, calculationProfileId, loadings } = parsed.document.inputs
  for (const mode of ['fixed', 'adaptive'] as const) {
    const fixed = createAnalysisOptionsForProfile(calculationProfileId)
    const analysisOptions = mode === 'fixed' ? fixed : fixed.methodId === 'equivalent-block-surface-v1'
      ? createAdaptiveEquivalentBlockAnalysisOptions() : createAdaptiveAnalysisOptions()
    const { surface } = buildPreviewSurfaceFallback({ section: sectionGeometryFromGeometryInput(geometry),
      rebars: geometryInputRebars(geometry), materialStore: materials, designBasis: design, calculationProfileId, analysisOptions })
    const uncertainty = mode === 'fixed' ? 0.02 :
      surface.directionError.withinTolerance && surface.stationError.withinTolerance
        ? Math.max(surface.directionError.maxRelativeComponent, surface.stationError.maxRelative) : null
    for (const basis of ['proportional3D', 'constantAxial'] as const) {
      const checks = checkLoadcasesUtilizationFromSurface(surface, loadings.combinations, basis)
      assert.deepEqual(checkLoadcasesFallback({ surface, loadcases: loadings.combinations, checkBasis: basis }), checks)
      for (const check of checks) assert.equal(check.adequacy,
        check.constantAxialStatus === 'axial-outside-domain' ? 'inadequate' : intervalVerdict(check.utilization, uncertainty))
      records.push({ file, calculationProfileId, mode, basis, uncertainty, checks })
    }
    console.log(`${file}/${mode}: ${loadings.combinations.length} authored combinations, both bases passed`)
  }
}
const out = process.env.PM_EVIDENCE_DIR ?? 'outputs/verdict-audit'
mkdirSync(out, { recursive: true })
const summary = { examples: files.length, checks: records.reduce((sum, record) => sum + record.checks.length, 0),
  configurations: records.length, failures: [] }
writeFileSync(`${out}/examples.json`, JSON.stringify({ summary, records }, null, 2))
console.log(JSON.stringify(summary, null, 2))
