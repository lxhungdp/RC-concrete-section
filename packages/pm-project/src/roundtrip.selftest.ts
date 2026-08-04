import assert from 'node:assert/strict'
import { createEmptyGeometryInput } from '@pm/geometry'
import {
  createDefaultMaterialStore,
  createKdsRebarSteel
} from '@pm/materials'
import {
  createEmptyLoadingsInput,
  createEmptyProjectDocument,
  createLoadCombination,
  createProjectDocument,
  parseProjectDocument,
  serializeProjectDocument
} from './index'

const run = () => {
  const materials = createDefaultMaterialStore()
  const steel2 = createKdsRebarSteel({ name: 'SD500', fy: 500 }, materials.steel.map((item) => item.id))
  materials.steel.push(steel2)

  const geometry = createEmptyGeometryInput({ id: 1, name: 'Roundtrip section' })
  geometry.outers = [
    {
      id: 1,
      points: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 400, y: 0 },
        { id: 3, x: 400, y: 600 },
        { id: 4, x: 0, y: 600 }
      ],
      holes: [
        {
          id: 1,
          points: [
            { id: 5, x: 100, y: 100 },
            { id: 6, x: 200, y: 100 },
            { id: 7, x: 200, y: 200 },
            { id: 8, x: 100, y: 200 }
          ]
        }
      ]
    }
  ]
  geometry.rebars = [
    { id: 1, dia: 25, x: 50, y: 50, steelMaterialId: 1 },
    { id: 2, dia: 25, x: 350, y: 550, steelMaterialId: 2 }
  ]

  const loadings = createEmptyLoadingsInput()
  loadings.combinations.push(createLoadCombination({ name: 'ULS', P: 1_000_000, Mx: 50_000_000, My: 0 }, []))

  const original = createProjectDocument({
    geometry,
    materials,
    loadings,
    meta: { id: 1, name: 'Roundtrip project' }
  })

  const raw = serializeProjectDocument(original)
  const json = JSON.parse(raw) as Record<string, unknown>
  assert.equal(json.version, 1)
  assert.equal((json.inputs as { geometry: { unit?: unknown } }).geometry.unit, undefined)
  assert.equal((json.inputs as { materials: { unit?: unknown } }).materials.unit, undefined)
  assert.equal((json.inputs as { loadings: { forceUnit?: unknown } }).loadings.forceUnit, undefined)

  const parsed = parseProjectDocument(raw)
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return

  assert.equal(parsed.document.meta.id, 1)
  assert.equal(parsed.document.inputs.geometry.outers[0]?.points[0]?.id, 1)
  assert.equal(parsed.document.inputs.materials.concrete.id, 1)
  assert.equal(parsed.document.inputs.materials.concrete.mc, 2350)
  assert.equal(parsed.document.inputs.materials.concrete.standard, 'KDS')
  assert.equal(parsed.document.inputs.materials.concrete.stressStrain.type, 'kds-parabolic')
  assert.ok((parsed.document.inputs.materials.concrete.factors?.alpha ?? 0) > 0)
  assert.equal(parsed.document.inputs.materials.concrete.factors?.gammaC, undefined)
  assert.ok((parsed.document.inputs.materials.concrete.elasticModulus ?? 0) > 0)
  assert.equal(parsed.document.inputs.materials.steel[0]?.standard, 'KDS')
  assert.equal(parsed.document.inputs.materials.steel[0]?.factors?.gammaS, undefined)
  assert.equal(
    parsed.document.inputs.materials.steel[0]?.limits?.epsY,
    parsed.document.inputs.materials.steel[0]!.fy / parsed.document.inputs.materials.steel[0]!.elasticModulus
  )
  assert.equal(parsed.document.inputs.materials.steel[1]?.id, 2)
  assert.equal(parsed.document.inputs.geometry.rebars[1]?.steelMaterialId, 2)
  assert.equal(parsed.document.inputs.loadings.combinations[0]?.P, 1_000_000)
  assert.equal(parsed.document.inputs.loadings.combinations[0]?.actionBasis, 'factoredULS')
  assert.equal(parsed.document.inputs.design.profileId, 'kds-2024-current-set')
  assert.equal(parsed.document.inputs.design.format, 'globalResultantFactor')
  const parsedAnalysis = parsed.document.inputs.analysis
  assert.equal(parsedAnalysis.methodId, 'strain-domain-surface-v1')
  if (parsedAnalysis.methodId !== 'strain-domain-surface-v1') throw new Error('Expected curve analysis options')
  assert.equal(parsedAnalysis.stations.intermediate.length, 23)
  assert.deepEqual(parsedAnalysis.directions.seed, {
    type: 'uniform',
    count: 36,
    startDeg: 0
  })
  assert.deepEqual(parsedAnalysis.directions.refinement, {
    type: 'adaptive',
    tolerance: 0.005,
    maxPasses: 6,
    maxDirections: 360,
    probe: 'all'
  })

  const empty = createEmptyProjectDocument({ id: 1, name: 'Empty' })
  const emptyParsed = parseProjectDocument(serializeProjectDocument(empty))
  assert.equal(emptyParsed.ok, true)

  console.log('pm-project roundtrip selftest: ok')
}

run()
