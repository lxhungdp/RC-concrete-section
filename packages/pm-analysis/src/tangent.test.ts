import { strict as assert } from 'node:assert'
import test from 'node:test'
import { geometryInputRebars, sectionGeometryFromGeometryInput } from '@pm/geometry'
import {
  compileConcreteMaterial,
  compileSteelMaterial,
  stressKdsParabolicConcrete,
  type CompiledMaterial,
  type ConcreteMaterial,
  type SteelMaterial
} from '@pm/materials'
import { evaluatePreparedState, evaluatePreparedStateWithTangent, prepareAnalysis } from './index'
import { referenceProjectDocument } from './reference-case'

const relativeClose = (actual: number, expected: number, tolerance: number, message: string) => {
  const scale = Math.max(1, Math.abs(actual), Math.abs(expected))
  assert.ok(Math.abs(actual - expected) <= tolerance * scale, `${message}: ${actual} vs ${expected}`)
}

const checkMaterialTangent = (name: string, material: CompiledMaterial, strains: number[]) => {
  test(`${name} tangent agrees with an independent central difference away from kinks`, () => {
    for (const strain of strains) {
      const step = Math.max(1e-9, Math.abs(strain) * 1e-6)
      const numerical = (material.stress(strain + step) - material.stress(strain - step)) / (2 * step)
      relativeClose(material.tangent(strain), numerical, 2e-7, `${name} at strain ${strain}`)
    }
  })
}

const document = referenceProjectDocument()
const baseConcrete = document.inputs.materials.concrete
const baseSteel = document.inputs.materials.steel[0]

test('compiled KDS n=2 stress is bit-identical to the public material law', () => {
  const compiled = compileConcreteMaterial(baseConcrete)
  for (const strain of [-0.001, 0, 1e-12, 0.0003, 0.0011, 0.002, 0.0025, 0.0033, 0.0033000001]) {
    assert.ok(
      Object.is(compiled.stress(strain), stressKdsParabolicConcrete(baseConcrete, strain)),
      `stress changed at strain ${strain}`
    )
  }
})

checkMaterialTangent('KDS n=2 concrete', compileConcreteMaterial(baseConcrete), [0.0003, 0.0011, 0.0025])
checkMaterialTangent(
  'KDS general-n concrete',
  compileConcreteMaterial({
    ...baseConcrete,
    stressStrain: { type: 'kds-parabolic', n: 1.65, eps0: 0.0021, epsCu: 0.0034, alpha: 0.84 }
  }),
  [0.00035, 0.0012, 0.0027]
)
checkMaterialTangent(
  'EC2 concrete',
  compileConcreteMaterial({
    ...baseConcrete,
    standard: 'EC2',
    stressStrain: { type: 'ec2-parabolic-rectangular', n: 1.8, epsC2: 0.002, epsCu2: 0.0035, alpha: 0.85 }
  }),
  [0.0004, 0.0013, 0.0028]
)
checkMaterialTangent(
  'concrete user curve',
  compileConcreteMaterial({
    ...baseConcrete,
    standard: 'CUSTOM',
    stressStrain: {
      type: 'user-curve',
      interpolation: 'linear',
      zeroTension: true,
      points: [
        { strain: 0, stress: 0 },
        { strain: 0.001, stress: 18 },
        { strain: 0.002, stress: 27 },
        { strain: 0.0035, stress: 25 }
      ]
    }
  }),
  [0.0004, 0.0014, 0.0026]
)
checkMaterialTangent(
  'elastic-perfectly-plastic steel',
  compileSteelMaterial({ ...baseSteel, stressStrain: { type: 'elastic-perfectly-plastic' } }),
  [-0.004, -0.001, 0.001, 0.004]
)
checkMaterialTangent(
  'bilinear steel',
  compileSteelMaterial({ ...baseSteel, stressStrain: { type: 'bilinear', hardeningRatio: 0.015 } }),
  [-0.004, -0.001, 0.001, 0.004]
)
checkMaterialTangent(
  'steel user curve',
  compileSteelMaterial({
    ...baseSteel,
    standard: 'CUSTOM',
    stressStrain: {
      type: 'user-curve',
      interpolation: 'linear',
      points: [
        { strain: -0.02, stress: -460 },
        { strain: -0.002, stress: -400 },
        { strain: 0, stress: 0 },
        { strain: 0.002, stress: 400 },
        { strain: 0.02, stress: 460 }
      ]
    }
  }),
  [-0.01, -0.001, 0.001, 0.01]
)

test('section consistent tangent predicts all three resultant derivatives', () => {
  const section = sectionGeometryFromGeometryInput(document.inputs.geometry)
  const rebars = geometryInputRebars(document.inputs.geometry)
  const prepared = prepareAnalysis(section, rebars, document.inputs.materials)
  const state = { e0: 0.0011, kx: 5e-7, ky: -3e-7 }
  const direction = [0.7, 0.8 / prepared.lengthScale, -0.45 / prepared.lengthScale] as const
  const step = 1e-7
  const plus = {
    e0: state.e0 + step * direction[0],
    kx: state.kx + step * direction[1],
    ky: state.ky + step * direction[2]
  }
  const minus = {
    e0: state.e0 - step * direction[0],
    kx: state.kx - step * direction[1],
    ky: state.ky - step * direction[2]
  }
  const rPlus = evaluatePreparedState(prepared, plus).total
  const rMinus = evaluatePreparedState(prepared, minus).total
  const { tangent } = evaluatePreparedStateWithTangent(prepared, state)
  const keys = ['P', 'Mx', 'My'] as const

  keys.forEach((key, row) => {
    const finiteDifference = (rPlus[key] - rMinus[key]) / (2 * step)
    const analytic = tangent[row].reduce((sum, value, column) => sum + value * direction[column], 0)
    relativeClose(analytic, finiteDifference, 2e-6, `${key} directional derivative`)
  })
})

// Compile-time guards: the spread-based fixtures above must remain valid concrete/steel definitions.
void (baseConcrete satisfies ConcreteMaterial)
void (baseSteel satisfies SteelMaterial)
