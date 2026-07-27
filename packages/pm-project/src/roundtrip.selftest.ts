import assert from 'node:assert/strict'
import { createEmptyGeometryInput } from '@pm/geometry'
import {
  applyEn1992ConcreteDerived,
  applyEn1992SteelDerived,
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
  materials.concrete = applyEn1992ConcreteDerived({
    ...materials.concrete,
    name: 'EN 1992 C30',
    standard: 'EC2',
    factors: { alpha: 0.85, gammaC: 1.5 }
  })
  materials.steel[0] = applyEn1992SteelDerived({
    ...materials.steel[0],
    name: 'EN 1992 B500',
    standard: 'EC2',
    fy: 500,
    factors: { gammaS: 1.15 }
  })
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
      ],
      rebars: [
        { id: 1, dia: 25, x: 50, y: 50, steelMaterialId: 1 },
        { id: 2, dia: 25, x: 350, y: 550, steelMaterialId: 2 }
      ]
    }
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
  assert.equal(json.version, 4)
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
  assert.equal(parsed.document.inputs.materials.concrete.standard, 'EC2')
  assert.equal(parsed.document.inputs.materials.concrete.stressStrain.type, 'ec2-parabolic-rectangular')
  assert.equal(parsed.document.inputs.materials.concrete.factors?.alpha, 0.85)
  assert.equal(parsed.document.inputs.materials.concrete.factors?.gammaC, 1.5)
  assert.ok((parsed.document.inputs.materials.concrete.elasticModulus ?? 0) > 0)
  assert.equal(parsed.document.inputs.materials.steel[0]?.standard, 'EC2')
  assert.equal(parsed.document.inputs.materials.steel[0]?.factors?.gammaS, 1.15)
  assert.equal(parsed.document.inputs.materials.steel[0]?.limits?.epsY, 500 / 1.15 / 200000)
  assert.equal(parsed.document.inputs.materials.steel[1]?.id, 2)
  assert.equal(parsed.document.inputs.geometry.outers[0]?.rebars[1]?.steelMaterialId, 2)
  assert.equal(parsed.document.inputs.loadings.combinations[0]?.P, 1_000_000)
  assert.equal(parsed.document.inputs.loadings.combinations[0]?.actionBasis, 'factoredULS')
  assert.equal(parsed.document.inputs.design.profileId, 'en-1992-1-1-2004-default')
  assert.equal(parsed.document.inputs.design.format, 'designMaterialReevaluation')
  assert.equal(parsed.document.inputs.analysis.stations.intermediate.length, 17)
  assert.deepEqual(parsed.document.inputs.analysis.directions.seed, {
    type: 'uniform',
    count: 24,
    startDeg: 0
  })

  const empty = createEmptyProjectDocument({ id: 1, name: 'Empty' })
  const emptyParsed = parseProjectDocument(serializeProjectDocument(empty))
  assert.equal(emptyParsed.ok, true)

  console.log('pm-project roundtrip selftest: ok')
}

run()
