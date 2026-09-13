/**
 * Same-process A/B harness for docs/03 section 8.
 *
 * The reference path reproduces the former combined-fibre loop. The production path consumes the
 * split prepared arrays. Every ledger ordinate must remain bit-identical before timings are useful.
 */
import { evaluatePreparedState, prepareAnalysis, type Resultant, type ResultantLedger, type StrainState } from '../src/index'
import { geometryInputRebars, sectionGeometryFromGeometryInput } from '@pm/geometry'
import { BENCH_CASES } from './sections'

class ReferenceCompensatedScalar {
  private sum = 0
  private correction = 0

  add(value: number) {
    const next = this.sum + value
    this.correction += Math.abs(this.sum) >= Math.abs(value)
      ? (this.sum - next) + value
      : (value - next) + this.sum
    this.sum = next
  }

  value() {
    return this.sum + this.correction
  }
}

class ReferenceCompensatedResultant {
  private readonly p = new ReferenceCompensatedScalar()
  private readonly mx = new ReferenceCompensatedScalar()
  private readonly my = new ReferenceCompensatedScalar()

  add(force: number, fiber: { x: number; y: number }) {
    this.p.add(force)
    this.mx.add(force * fiber.y)
    this.my.add(force * fiber.x)
  }

  finish(): Resultant {
    return { P: this.p.value(), Mx: this.mx.value(), My: this.my.value() }
  }
}

const referencePair = (left: number, right: number) => {
  const sum = new ReferenceCompensatedScalar()
  sum.add(left)
  sum.add(right)
  return sum.value()
}

const referenceAdd = (left: Resultant, right: Resultant): Resultant => ({
  P: referencePair(left.P, right.P),
  Mx: referencePair(left.Mx, right.Mx),
  My: referencePair(left.My, right.My)
})

const referenceEvaluate = (
  prepared: ReturnType<typeof prepareAnalysis>,
  state: StrainState
): ResultantLedger => {
  const concreteSum = new ReferenceCompensatedResultant()
  const steelGrossSum = new ReferenceCompensatedResultant()
  const displacedConcreteSum = new ReferenceCompensatedResultant()

  for (const fiber of prepared.fibers) {
    const strain = state.e0 + state.kx * fiber.y + state.ky * fiber.x
    const concreteStress = prepared.materials.concrete.stress(strain)
    if (!Number.isFinite(concreteStress)) throw new Error('Reference concrete stress is non-finite.')
    if (fiber.kind !== 'rebar') {
      concreteSum.add(concreteStress * fiber.area, fiber)
      continue
    }
    const steelStress = fiber.steel.stress(strain)
    if (!Number.isFinite(steelStress)) throw new Error('Reference steel stress is non-finite.')
    steelGrossSum.add(steelStress * fiber.area, fiber)
    displacedConcreteSum.add(-concreteStress * fiber.area, fiber)
  }

  const concrete = concreteSum.finish()
  const steelGross = steelGrossSum.finish()
  const displacedConcrete = displacedConcreteSum.finish()
  const steel = referenceAdd(steelGross, displacedConcrete)
  return { concrete, steelGross, displacedConcrete, steel, total: referenceAdd(concrete, steel) }
}

const states: StrainState[] = Array.from({ length: 144 }, (_, index) => {
  const beta = 2 * Math.PI * (index % 36) / 36
  const amplitude = 0.000001 + 0.000014 * ((index % 17) / 16)
  return {
    e0: -0.004 + 0.008 * ((index % 23) / 22),
    kx: amplitude * Math.cos(beta),
    ky: amplitude * Math.sin(beta)
  }
})

const ledgerValues = (ledger: ResultantLedger) => [
  ledger.concrete.P, ledger.concrete.Mx, ledger.concrete.My,
  ledger.steelGross.P, ledger.steelGross.Mx, ledger.steelGross.My,
  ledger.displacedConcrete.P, ledger.displacedConcrete.Mx, ledger.displacedConcrete.My,
  ledger.steel.P, ledger.steel.Mx, ledger.steel.My,
  ledger.total.P, ledger.total.Mx, ledger.total.My
]

const median = (values: number[]) => [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)]

const time = (run: () => void) => {
  run()
  const samples: number[] = []
  for (let repeat = 0; repeat < 7; repeat += 1) {
    const started = performance.now()
    run()
    samples.push(performance.now() - started)
  }
  return median(samples)
}

const selectedCases = BENCH_CASES.filter((item) =>
  ['reference', 'tall-rectangle-dense', 'hollow-circular', 'tabulated-law'].includes(item.key)
)
const rows: Array<Record<string, string | number>> = []
for (const item of selectedCases) {
  const prepared = prepareAnalysis(
    sectionGeometryFromGeometryInput(item.geometry),
    geometryInputRebars(item.geometry),
    item.materials
  )
  for (const state of states) {
    const reference = ledgerValues(referenceEvaluate(prepared, state))
    const production = ledgerValues(evaluatePreparedState(prepared, state))
    for (let index = 0; index < reference.length; index += 1) {
      if (!Object.is(reference[index], production[index])) {
        throw new Error(`${item.key} ledger ordinate ${index} changed: ${reference[index]} -> ${production[index]}`)
      }
    }
  }
  const referenceRun = () => {
    for (const state of states) referenceEvaluate(prepared, state)
  }
  const productionRun = () => {
    for (const state of states) evaluatePreparedState(prepared, state)
  }
  // Alternate ordering so one implementation does not consistently receive the colder CPU state.
  const referenceFirst = time(referenceRun)
  const productionSecond = time(productionRun)
  const productionFirst = time(productionRun)
  const referenceSecond = time(referenceRun)
  const referenceMs = Math.min(referenceFirst, referenceSecond)
  const productionMs = Math.min(productionFirst, productionSecond)
  rows.push({
    case: item.key,
    points: prepared.concreteFibers.length,
    bars: prepared.rebarFibers.length,
    referenceMs: referenceMs.toFixed(2),
    productionMs: productionMs.toFixed(2),
    speedup: `${(referenceMs / productionMs).toFixed(2)}x`
  })
}

console.table(rows)
const referenceTotal = rows.reduce((sum, row) => sum + Number(row.referenceMs), 0)
const productionTotal = rows.reduce((sum, row) => sum + Number(row.productionMs), 0)
console.log(`Same-process total: ${referenceTotal.toFixed(2)} -> ${productionTotal.toFixed(2)} ms (${(referenceTotal / productionTotal).toFixed(2)}x)`)

