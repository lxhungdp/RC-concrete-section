/**
 * Constitutive-law microbenchmark. Each pair executes the original public/runtime path and the
 * compiled closure on the same deterministic strain sequence; the accumulated stress is checked so
 * V8 cannot remove the calls and so speed never hides a result change.
 */
import {
  compileConcreteMaterial,
  stressKdsParabolicConcrete,
  type ConcreteMaterial
} from '@pm/materials'
import { referenceProjectDocument } from '../reference-case'

const CALLS = Number(process.argv[2] ?? 5_000_000)
const RUNS = 7

const measure = (fn: (strain: number) => number) => {
  const execute = () => {
    let checksum = 0
    for (let i = 0; i < CALLS; i++) checksum += fn(((i % 4096) / 4095) * 0.0035 - 0.0001)
    return checksum
  }
  execute()
  const samples: number[] = []
  let checksum = 0
  for (let run = 0; run < RUNS; run++) {
    const start = performance.now()
    checksum = execute()
    samples.push(performance.now() - start)
  }
  return { ms: Math.min(...samples), checksum }
}

const compare = (label: string, runtime: (strain: number) => number, compiled: (strain: number) => number) => {
  const before = measure(runtime)
  const after = measure(compiled)
  const relative = Math.abs(before.checksum - after.checksum) / Math.max(1, Math.abs(before.checksum))
  console.log(
    `${label.padEnd(24)} ${(before.ms * 1e6 / CALLS).toFixed(2).padStart(9)} ns/call → ` +
      `${(after.ms * 1e6 / CALLS).toFixed(2).padStart(8)} ns/call  ×${(before.ms / after.ms).toFixed(2)}  ` +
      `checksum Δ=${relative.toExponential(2)}`
  )
}

const concrete = referenceProjectDocument().inputs.materials.concrete
compare(
  'KDS n=2',
  (strain) => stressKdsParabolicConcrete(concrete, strain),
  compileConcreteMaterial(concrete).stress
)

const points = [
  { strain: -0.004, stress: 0 },
  { strain: 0, stress: 0 },
  { strain: 0.0003, stress: 7 },
  { strain: 0.0006, stress: 13 },
  { strain: 0.0009, stress: 18 },
  { strain: 0.0012, stress: 22 },
  { strain: 0.0015, stress: 25 },
  { strain: 0.0018, stress: 27 },
  { strain: 0.0021, stress: 28 },
  { strain: 0.0025, stress: 28 },
  { strain: 0.0029, stress: 27 },
  { strain: 0.0033, stress: 25 },
  { strain: 0.004, stress: 0 }
].reverse()
const interpolateWithPerCallSort = (strain: number) => {
  const sorted = [...points].sort((a, b) => a.strain - b.strain)
  if (strain <= sorted[0].strain) return sorted[0].stress
  if (strain >= sorted[sorted.length - 1].strain) return sorted[sorted.length - 1].stress
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    if (strain >= a.strain && strain <= b.strain) {
      const t = (strain - a.strain) / Math.max(1e-12, b.strain - a.strain)
      return a.stress + (b.stress - a.stress) * t
    }
  }
  return 0
}
const userCurve: ConcreteMaterial = {
  ...concrete,
  standard: 'CUSTOM',
  stressStrain: { type: 'user-curve', interpolation: 'linear', zeroTension: true, points }
}
compare(
  'user curve (13 points)',
  (strain) => (strain <= 0 ? 0 : interpolateWithPerCallSort(strain)),
  compileConcreteMaterial(userCurve).stress
)
