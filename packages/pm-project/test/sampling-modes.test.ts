import assert from 'node:assert/strict'
import test from 'node:test'
import { createEmptyGeometryInput } from '@pm/geometry'
import { createDefaultMaterialStore } from '@pm/materials'
import {
  ADAPTIVE_INITIAL_STATION_COUNT,
  ADAPTIVE_SEED_DIRECTION_COUNT,
  UNIFIED_STATION_COUNT,
  createAdaptiveAnalysisOptions,
  createAdaptiveEquivalentBlockAnalysisOptions,
  createDefaultAnalysisOptions,
  createProjectDocument,
  parseProjectDocument
} from '../src/index'

test('fixed and adaptive presets are complete mutually-exclusive sampling modes', () => {
  const fixed = createDefaultAnalysisOptions()
  assert.equal(fixed.samplingMode, 'fixed')
  assert.equal(fixed.stations.intermediate.length + 2, UNIFIED_STATION_COUNT)
  assert.equal(fixed.directions.seed.type, 'uniform')
  assert.equal(fixed.directions.seed.type === 'uniform' ? fixed.directions.seed.count : 0, 36)
  assert.equal(fixed.stations.refinement.type, 'fixed')
  assert.equal(fixed.directions.refinement.type, 'fixed')

  const adaptive = createAdaptiveAnalysisOptions()
  assert.equal(adaptive.samplingMode, 'adaptive')
  assert.equal(adaptive.stations.refinement.type === 'adaptive' ? adaptive.stations.refinement.tolerance : 0, 0.01)
  assert.equal(adaptive.directions.refinement.type === 'adaptive' ? adaptive.directions.refinement.tolerance : 0, 0.01)
  assert.equal(adaptive.stations.intermediate.length + 2, ADAPTIVE_INITIAL_STATION_COUNT)
  assert.equal(adaptive.directions.seed.type, 'uniform')
  assert.equal(
    adaptive.directions.seed.type === 'uniform' ? adaptive.directions.seed.count : 0,
    ADAPTIVE_SEED_DIRECTION_COUNT
  )
  assert.equal(adaptive.stations.refinement.type, 'adaptive')
  assert.equal(adaptive.directions.refinement.type, 'adaptive')

  const block = createAdaptiveEquivalentBlockAnalysisOptions()
  assert.equal(block.samplingMode, 'adaptive')
  assert.equal(block.neutralAxisStations.values.length + 2, ADAPTIVE_INITIAL_STATION_COUNT)
  assert.equal(block.directions.seedCount, ADAPTIVE_SEED_DIRECTION_COUNT)
  assert.equal(block.neutralAxisStations.refinement.type, 'adaptive')
  assert.equal(block.directions.refinement.type, 'adaptive')
})

test('project validation rejects mixed fixed/adaptive sampling', () => {
  const document = createProjectDocument({
    geometry: createEmptyGeometryInput({ id: 1, name: 'sampling mode validation' }),
    materials: createDefaultMaterialStore()
  })
  const analysis = createAdaptiveAnalysisOptions()
  analysis.directions.refinement = { type: 'fixed', probe: 'all' }
  document.inputs.analysis = analysis
  const parsed = parseProjectDocument(document)
  assert.equal(parsed.ok, false)
  if (!parsed.ok) assert.match(parsed.error, /cannot be mixed|must use fixed station and direction/i)
})

test('adaptive presets round-trip without being converted to the fixed grid', () => {
  const document = createProjectDocument({
    geometry: createEmptyGeometryInput({ id: 1, name: 'adaptive round trip' }),
    materials: createDefaultMaterialStore()
  })
  document.inputs.analysis = createAdaptiveAnalysisOptions()
  const parsed = parseProjectDocument(document)
  assert.equal(parsed.ok, true, parsed.ok ? '' : parsed.error)
  if (!parsed.ok || parsed.document.inputs.analysis.methodId !== 'strain-domain-surface-v1') return
  assert.equal(parsed.document.inputs.analysis.samplingMode, 'adaptive')
  assert.equal(parsed.document.inputs.analysis.stations.intermediate.length + 2, ADAPTIVE_INITIAL_STATION_COUNT)
})

test('legacy mixed refinement is migrated to one complete adaptive mode', () => {
  const document = createProjectDocument({
    geometry: createEmptyGeometryInput({ id: 1, name: 'legacy adaptive migration' }),
    materials: createDefaultMaterialStore()
  })
  const legacy = structuredClone(document) as unknown as {
    inputs: {
      analysis: {
        samplingMode?: string
        directions: { refinement: { type: 'fixed'; probe: 'all' } }
        stations: { refinement: ReturnType<typeof createAdaptiveAnalysisOptions>['stations']['refinement'] }
      }
    }
  }
  delete legacy.inputs.analysis.samplingMode
  legacy.inputs.analysis.stations.refinement = createAdaptiveAnalysisOptions().stations.refinement
  legacy.inputs.analysis.directions.refinement = { type: 'fixed', probe: 'all' }

  const parsed = parseProjectDocument(legacy)
  assert.equal(parsed.ok, true, parsed.ok ? '' : parsed.error)
  if (!parsed.ok || parsed.document.inputs.analysis.methodId !== 'strain-domain-surface-v1') return
  assert.equal(parsed.document.inputs.analysis.samplingMode, 'adaptive')
  assert.equal(parsed.document.inputs.analysis.stations.refinement.type, 'adaptive')
  assert.equal(parsed.document.inputs.analysis.directions.refinement.type, 'adaptive')
})
