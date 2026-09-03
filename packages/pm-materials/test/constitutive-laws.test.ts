import assert from 'node:assert/strict'
import test from 'node:test'
import {
  compileAciWhitneyConcrete,
  compileAs3600BlockConcrete,
  compileBilinearSteel,
  compileConcreteUserCurve,
  compileEc2ParabolicRectangularConcrete,
  compileElasticPerfectlyPlasticSteel,
  compileKdsParabolicConcrete,
  compileSteelUserCurve,
  compileUserBlockConcrete,
  stressEc2ParabolicRectangularFrom,
  stressKdsParabolicFrom,
  type ConcreteMaterial,
  type Ec2ParabolicRectangularParams,
  type KdsParabolicParams,
  type SteelMaterial
} from '../src/index'

const close = (actual: number, expected: number, tolerance = 1e-12) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)),
    `${actual} != ${expected}`
  )

const concrete = (
  stressStrain: ConcreteMaterial['stressStrain'],
  patch: Partial<ConcreteMaterial> = {}
): ConcreteMaterial => ({
  id: 1,
  name: 'test concrete',
  standard: 'CUSTOM',
  fck: 30,
  mc: 2350,
  stressStrain,
  limits: { eps0: 0.002, epsCu: 0.0035, ignoreTension: true },
  ...patch
})

const steel = (
  stressStrain: SteelMaterial['stressStrain'],
  patch: Partial<SteelMaterial> = {}
): SteelMaterial => ({
  id: 1,
  name: 'test steel',
  standard: 'CUSTOM',
  fy: 500,
  elasticModulus: 200_000,
  stressStrain,
  limits: { epsU: 0.05 },
  ...patch
})

test('KDS parabolic law matches its independently written branch equation', () => {
  const params: KdsParabolicParams = { eps0: 0.002, epsCu: 0.0033, n: 2, peak: 25.5 }
  const expected = (strain: number) => {
    if (strain <= 0 || strain > params.epsCu) return 0
    if (strain > params.eps0) return params.peak
    return params.peak * (1 - (1 - strain / params.eps0) ** params.n)
  }
  const strains = [0, params.eps0 / 2, params.eps0, 0.0026, params.epsCu, params.epsCu * (1 + 1e-12)]
  const compiled = compileKdsParabolicConcrete(concrete({
    type: 'kds-parabolic', n: params.n, eps0: params.eps0, epsCu: params.epsCu, alpha: 0.85
  }, {
    fck: 30,
    limits: { eps0: params.eps0, epsCu: params.epsCu, ignoreTension: true },
    factors: { alpha: 0.85 }
  }))
  for (const strain of strains) {
    close(stressKdsParabolicFrom(params, strain), expected(strain))
    close(compiled.stress(strain), expected(strain))
  }
})

test('KDS non-quadratic branch keeps the independently calculated exponent', () => {
  const params: KdsParabolicParams = { eps0: 0.0022, epsCu: 0.0031, n: 1.37, peak: 40.8 }
  const material = concrete({
    type: 'kds-parabolic', n: params.n, eps0: params.eps0, epsCu: params.epsCu, alpha: 0.85
  }, {
    fck: 48,
    limits: { eps0: params.eps0, epsCu: params.epsCu, ignoreTension: true },
    factors: { alpha: 0.85 }
  })
  const strain = params.eps0 * 0.43
  const expected = params.peak * (1 - (1 - strain / params.eps0) ** params.n)
  close(compileKdsParabolicConcrete(material).stress(strain), expected)
})

test('EN parabolic-rectangular law matches its independently written branch equation', () => {
  const params: Ec2ParabolicRectangularParams = {
    epsC2: 0.002,
    epsCu2: 0.0035,
    n: 2,
    peak: 20,
    ignoreTension: true
  }
  const expected = (strain: number) => {
    if (strain <= 0 || strain > params.epsCu2) return 0
    if (strain > params.epsC2) return params.peak
    return params.peak * (1 - (1 - strain / params.epsC2) ** params.n)
  }
  const material = concrete({
    type: 'ec2-parabolic-rectangular', n: params.n, epsC2: params.epsC2, epsCu2: params.epsCu2, alpha: 1
  }, {
    fck: 30,
    limits: { eps0: params.epsC2, epsCu: params.epsCu2, ignoreTension: true },
    factors: { alpha: 1, gammaC: 1.5 }
  })
  const compiled = compileEc2ParabolicRectangularConcrete(material)
  for (const strain of [0, params.epsC2 / 2, params.epsC2, 0.0027, params.epsCu2, params.epsCu2 * (1 + 1e-12)]) {
    close(stressEc2ParabolicRectangularFrom(params, strain), expected(strain))
    close(compiled.stress(strain), expected(strain))
  }
})

test('equivalent rectangular block render laws are constant only inside their declared strain domain', () => {
  const epsCu = 0.003
  const aci = compileAciWhitneyConcrete(concrete({
    type: 'aci-whitney-block', beta1: 0.8, epsCu, alpha: 0.85
  }, { fck: 40, limits: { epsCu, ignoreTension: true }, factors: { alpha: 0.85 } }))
  const as = compileAs3600BlockConcrete(concrete({
    type: 'as3600-equivalent-block', alpha2: 0.79, gamma: 0.87, epsCu
  }, { fck: 40, limits: { epsCu, ignoreTension: true } }))
  const user = compileUserBlockConcrete(concrete({
    type: 'user-block', alpha: 0.72, beta1: 0.77, epsCu
  }, { fck: 40, limits: { epsCu, ignoreTension: true }, factors: { gammaC: 1.2, resistanceScale: 0.9 } }))

  for (const [law, peak] of [[aci, 0.85 * 40], [as, 0.79 * 40], [user, 0.72 / 1.2 * 0.9 * 40]] as const) {
    close(law.stress(0), 0)
    close(law.stress(epsCu / 2), peak)
    close(law.stress(epsCu), peak)
    close(law.stress(epsCu * (1 + 1e-12)), 0)
  }
})

test('elastic-perfectly-plastic steel reaches and retains the design yield plateau through epsU', () => {
  const material = steel({ type: 'elastic-perfectly-plastic' }, {
    factors: { gammaS: 1.25, resistanceScale: 0.9 },
    limits: { epsU: 0.05 }
  })
  const law = compileElasticPerfectlyPlasticSteel(material)
  const fyd = 500 / 1.25 * 0.9
  const epsY = fyd / 200_000
  const expected = (strain: number) => Math.min(fyd, Math.max(-fyd, 200_000 * strain))
  for (const strain of [-material.limits!.epsU!, -2 * epsY, -epsY, 0, epsY, 2 * epsY, material.limits!.epsU!]) {
    close(law.stress(strain), expected(strain))
  }
})

test('bilinear steel matches its elastic and hardening branches through epsU', () => {
  const hardeningRatio = 0.01
  const material = steel({ type: 'bilinear', hardeningRatio }, { limits: { epsY: 0.0025, epsU: 0.05 } })
  const law = compileBilinearSteel(material)
  const expected = (strain: number) => {
    const sign = strain < 0 ? -1 : 1
    const magnitude = Math.abs(strain)
    if (magnitude <= 0.0025) return 200_000 * strain
    return sign * (500 + 200_000 * hardeningRatio * (magnitude - 0.0025))
  }
  for (const strain of [-0.05, -0.005, -0.0025, 0, 0.0025, 0.005, 0.05]) {
    close(law.stress(strain), expected(strain))
  }
})

test('user concrete and steel curves interpolate independently and clamp outside their tables', () => {
  const points = [
    { strain: -0.01, stress: -300 },
    { strain: 0, stress: 0 },
    { strain: 0.002, stress: 20 },
    { strain: 0.004, stress: 24 }
  ]
  const concreteLaw = compileConcreteUserCurve(concrete({
    type: 'user-curve', interpolation: 'linear', zeroTension: true, points: points.slice(1)
  }, { factors: { resistanceScale: 0.8 }, limits: { epsCu: 0.004, ignoreTension: true } }))
  close(concreteLaw.stress(-0.001), 0)
  close(concreteLaw.stress(0.001), 8)
  close(concreteLaw.stress(0.003), 17.6)
  close(concreteLaw.stress(0.01), 19.2)

  const steelLaw = compileSteelUserCurve(steel({ type: 'user-curve', interpolation: 'linear', points }))
  close(steelLaw.stress(-0.02), -300)
  close(steelLaw.stress(-0.005), -150)
  close(steelLaw.stress(0.001), 10)
  close(steelLaw.stress(0.003), 22)
  close(steelLaw.stress(0.01), 24)
})

