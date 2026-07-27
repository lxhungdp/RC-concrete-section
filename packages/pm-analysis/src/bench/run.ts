/**
 * Timing and exact-result harness for the analysis kernel (`docs/08` §8).
 *
 * The point is not the timings on their own. An optimisation is only allowed to land if it
 * reproduces the recorded fingerprint, so every run writes both:
 *
 *   - `timings`     min and median wall time per stage per section;
 *   - `fingerprint` every number the stage produced, at full double precision.
 *
 * Usage:
 *   tsx src/bench/run.ts --out before.json
 *   tsx src/bench/run.ts --out after.json --baseline before.json
 *
 * With `--baseline` the run prints a speed-up table and, for every fingerprinted quantity, the
 * largest relative deviation from the baseline. Anything above `--tol` (default 0: bit-identical)
 * exits non-zero.
 */
import { spawnSync } from 'node:child_process'
import { writeFileSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  buildConcreteMesh,
  geometryInputRebars,
  netConcreteCentroid,
  sectionGeometryFromGeometryInput
} from '@pm/geometry'
import { createLoadCombination } from '@pm/project'
import {
  buildPreviewSurface,
  buildPreviewSurfaceFromPrepared,
  contourStrainAngleSamples,
  prepareAnalysis,
  sliceFixedPContour,
  sliceMomentPlane,
  solveInversePreview,
  solveInversePreviewFromPrepared
} from '../index'
import { BENCH_CASES, type BenchCase } from './sections'

type Stage = 'mesh' | 'prepare' | 'surface' | 'surfacePrepared' | 'contour' | 'inverse' | 'inversePrepared' | 'momentPlane'

type CaseReport = {
  key: string
  title: string
  timings: Record<Stage, { medianMs: number; minMs: number; runs: number }>
  size: {
    cellSize: number
    minCaliperWidth: number
    grid: string
    cells: number
    triangles: number
    quadraturePoints: number
    rebars: number
  }
  fingerprint: Record<string, number[] | string>
}

type BenchReport = {
  node: string
  createdAt: string
  cases: CaseReport[]
}

const arg = (name: string, fallback?: string) => {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

const REPEATS = Number(arg('repeats', '15'))
const TOL = Number(arg('tol', '0'))

/** Order-sensitive FNV-1a over the exact decimal form of every coordinate. */
const hashNumbers = (values: Iterable<number>) => {
  let hash = 0x811c9dc5
  for (const value of values) {
    const text = Object.is(value, -0) ? '0' : String(value)
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i)
      hash = Math.imul(hash, 0x01000193)
    }
    hash ^= 0x2c
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

const time = <T>(runs: number, run: () => T) => {
  run() // warm up: let the JIT settle before anything is recorded
  const samples: number[] = []
  let last!: T
  for (let i = 0; i < runs; i++) {
    const start = performance.now()
    last = run()
    samples.push(performance.now() - start)
  }
  const sorted = [...samples].sort((a, b) => a - b)
  return {
    value: last,
    medianMs: sorted[Math.floor(sorted.length / 2)],
    minMs: sorted[0],
    runs
  }
}

const runCase = (benchCase: BenchCase): CaseReport => {
  const section = sectionGeometryFromGeometryInput(benchCase.geometry)
  const rebars = geometryInputRebars(benchCase.geometry)
  const materials = benchCase.materials

  const mesh = time(REPEATS, () => buildConcreteMesh(section))
  const prepared = time(REPEATS, () => prepareAnalysis(section, rebars, materials))
  const surface = time(REPEATS, () => buildPreviewSurface(section, rebars, materials))
  const surfacePrepared = time(REPEATS, () => buildPreviewSurfaceFromPrepared(prepared.value))
  const contour = time(REPEATS, () =>
    benchCase.contourLevels.map((level) => sliceFixedPContour(surface.value.points, level))
  )
  const momentPlane = time(REPEATS, () => sliceMomentPlane(surface.value.points, Math.PI / 7))
  const loadcase = createLoadCombination({ id: 1, name: 'bench', ...benchCase.demand })
  const inverse = time(REPEATS, () =>
    solveInversePreview(section, rebars, materials, loadcase, contour.value[0] ?? [])
  )
  const inversePrepared = time(REPEATS, () =>
    solveInversePreviewFromPrepared(prepared.value, loadcase, contour.value[0] ?? [])
  )

  const origin = netConcreteCentroid(section)
  const points = surface.value.points
  const inverseResult = inverse.value
  // Path order and the repeated closing vertex are topology, not new capacity values. Normalize
  // the connected paths to the legacy point-set order so this fingerprint still catches any
  // numerical movement of an intersection without flagging the corrected traversal itself.
  const momentPlanePoints = momentPlane.value
    .flatMap((path) => (path.closed ? path.points.slice(0, -1) : path.points))
    .sort((a, b) => b.P - a.P || a.M - b.M)

  const fingerprint: CaseReport['fingerprint'] = {
    origin: [origin.x, origin.y],
    meshExact: [mesh.value.report.exact.area, mesh.value.report.exact.firstMomentX, mesh.value.report.exact.firstMomentY],
    meshSummed: [
      mesh.value.report.meshed.area,
      mesh.value.report.meshed.firstMomentX,
      mesh.value.report.meshed.firstMomentY
    ],
    meshDiscardedArea: [mesh.value.report.discardedArea],
    meshQuadratureHash: hashNumbers(mesh.value.points.flatMap((point) => [point.x, point.y, point.area])),
    meshTriangleHash: hashNumbers(
      mesh.value.triangles.flatMap((tri) => [tri.ax, tri.ay, tri.bx, tri.by, tri.cx, tri.cy, tri.area])
    ),
    meshWarnings: mesh.value.report.warnings.join(' | '),
    surfaceP: points.map((point) => point.P),
    surfaceMx: points.map((point) => point.Mx),
    surfaceMy: points.map((point) => point.My),
    surfaceConcreteP: points.map((point) => point.ledger.concrete.P),
    surfaceSteelP: points.map((point) => point.ledger.steel.P),
    surfaceDisplacedP: points.map((point) => point.ledger.displacedConcrete.P),
    surfaceStateE0: points.map((point) => point.state.e0),
    surfaceStateKx: points.map((point) => point.state.kx),
    surfaceStateKy: points.map((point) => point.state.ky),
    surfaceWarnings: surface.value.warnings.join(' | '),
    contourMx: contour.value.flatMap((level) => level.map((point) => point.Mx)),
    contourMy: contour.value.flatMap((level) => level.map((point) => point.My)),
    contourSampleCount: contour.value.map((level) => contourStrainAngleSamples(level).length),
    momentPlaneP: momentPlanePoints.map((point) => point.P),
    momentPlaneM: momentPlanePoints.map((point) => point.M),
    inverseState: [inverseResult.state.e0, inverseResult.state.kx, inverseResult.state.ky],
    inverseResponse: [inverseResult.response.P, inverseResult.response.Mx, inverseResult.response.My],
    inverseResidualNorm: [inverseResult.residualNorm],
    inverseIterations: [inverseResult.iterations],
    inverseUtilization: [inverseResult.utilization ?? Number.NaN],
    inverseFlags: `${inverseResult.converged}/${inverseResult.admissibility.ok}/${inverseResult.ok}`,
    inverseAdmissibility: [
      inverseResult.admissibility.maxConcreteCompression,
      inverseResult.admissibility.maxSteelTension
    ]
  }

  return {
    key: benchCase.key,
    title: benchCase.title,
    timings: {
      mesh: { medianMs: mesh.medianMs, minMs: mesh.minMs, runs: mesh.runs },
      prepare: { medianMs: prepared.medianMs, minMs: prepared.minMs, runs: prepared.runs },
      surface: { medianMs: surface.medianMs, minMs: surface.minMs, runs: surface.runs },
      surfacePrepared: {
        medianMs: surfacePrepared.medianMs,
        minMs: surfacePrepared.minMs,
        runs: surfacePrepared.runs
      },
      contour: { medianMs: contour.medianMs, minMs: contour.minMs, runs: contour.runs },
      momentPlane: { medianMs: momentPlane.medianMs, minMs: momentPlane.minMs, runs: momentPlane.runs },
      inverse: { medianMs: inverse.medianMs, minMs: inverse.minMs, runs: inverse.runs },
      inversePrepared: {
        medianMs: inversePrepared.medianMs,
        minMs: inversePrepared.minMs,
        runs: inversePrepared.runs
      }
    },
    size: {
      cellSize: mesh.value.report.cellSize,
      minCaliperWidth: mesh.value.report.minCaliperWidth,
      grid: `${mesh.value.report.gridX}x${mesh.value.report.gridY}`,
      cells: mesh.value.report.cells,
      triangles: mesh.value.report.triangles,
      quadraturePoints: mesh.value.report.points,
      rebars: rebars.length
    },
    fingerprint
  }
}

const relativeDeviation = (actual: number, expected: number) => {
  if (Object.is(actual, expected)) return 0
  if (Number.isNaN(actual) && Number.isNaN(expected)) return 0
  const scale = Math.max(Math.abs(expected), Math.abs(actual))
  if (scale === 0) return 0
  return Math.abs(actual - expected) / scale
}

type Deviation = { caseKey: string; quantity: string; relative: number; detail: string }

const compareFingerprints = (before: BenchReport, after: BenchReport): Deviation[] => {
  const deviations: Deviation[] = []

  for (const afterCase of after.cases) {
    const beforeCase = before.cases.find((item) => item.key === afterCase.key)
    if (!beforeCase) {
      deviations.push({
        caseKey: afterCase.key,
        quantity: '(case)',
        relative: Number.POSITIVE_INFINITY,
        detail: 'missing from the baseline'
      })
      continue
    }

    for (const [quantity, afterValue] of Object.entries(afterCase.fingerprint)) {
      const beforeValue = beforeCase.fingerprint[quantity]

      if (typeof afterValue === 'string' || typeof beforeValue === 'string') {
        if (afterValue !== beforeValue) {
          deviations.push({
            caseKey: afterCase.key,
            quantity,
            relative: Number.POSITIVE_INFINITY,
            detail: `"${String(beforeValue)}" -> "${String(afterValue)}"`
          })
        }
        continue
      }
      if (!beforeValue) {
        deviations.push({ caseKey: afterCase.key, quantity, relative: Number.POSITIVE_INFINITY, detail: 'new quantity' })
        continue
      }
      if (beforeValue.length !== afterValue.length) {
        deviations.push({
          caseKey: afterCase.key,
          quantity,
          relative: Number.POSITIVE_INFINITY,
          detail: `length ${beforeValue.length} -> ${afterValue.length}`
        })
        continue
      }

      let worst = 0
      let worstIndex = -1
      for (let i = 0; i < afterValue.length; i++) {
        const relative = relativeDeviation(afterValue[i], beforeValue[i])
        if (relative > worst) {
          worst = relative
          worstIndex = i
        }
      }
      if (worst > 0) {
        deviations.push({
          caseKey: afterCase.key,
          quantity,
          relative: worst,
          detail: `[${worstIndex}] ${beforeValue[worstIndex]} -> ${afterValue[worstIndex]}`
        })
      }
    }
  }

  return deviations.sort((a, b) => b.relative - a.relative)
}

const pad = (value: string | number, width: number, left = false) => {
  const text = String(value)
  return left ? text.padEnd(width) : text.padStart(width)
}

/**
 * Every case runs in its own process.
 *
 * Sharing one process made the numbers unusable: with identical code, back-to-back runs differed by
 * up to 2x because the heap the earlier cases had grown, and the GC pressure they left behind,
 * followed the later ones. Isolation plus min-of-N is what makes an A/B comparison mean anything on
 * a laptop.
 */
const runCaseInChildProcess = (key: string): CaseReport => {
  const result = spawnSync(
    process.execPath,
    [...process.execArgv, fileURLToPath(import.meta.url), '--only', key, '--emit-json', '--repeats', String(REPEATS)],
    { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] }
  )
  if (result.status !== 0) throw new Error(`Benchmark case ${key} failed with status ${result.status}`)
  return JSON.parse(result.stdout) as CaseReport
}

const run = () => {
  const only = arg('only')
  const cases = only ? BENCH_CASES.filter((item) => item.key === only) : BENCH_CASES
  if (cases.length === 0) throw new Error(`No benchmark case matches --only ${only}`)

  if (process.argv.includes('--emit-json')) {
    process.stdout.write(JSON.stringify(runCase(cases[0])))
    return
  }

  const report: BenchReport = {
    node: process.version,
    createdAt: new Date().toISOString(),
    cases: cases.map((benchCase) => {
      process.stderr.write(`  running ${benchCase.key}…\n`)
      return runCaseInChildProcess(benchCase.key)
    })
  }

  console.log(`Analysis kernel benchmark — node ${report.node}, ${REPEATS} timed runs per stage\n`)
  console.log(
    `${pad('case', 22, true)}${pad('Dmin', 9)}${pad('h', 8)}${pad('cells', 8)}${pad('qpts', 9)}${pad('bars', 6)}` +
      `${pad('mesh ms', 10)}${pad('surface', 10)}${pad('contour', 9)}${pad('inverse', 9)}`
  )
  for (const item of report.cases) {
    console.log(
      `${pad(item.key, 22, true)}${pad(item.size.minCaliperWidth.toFixed(0), 9)}${pad(item.size.cellSize.toFixed(2), 8)}` +
        `${pad(item.size.cells, 8)}${pad(item.size.quadraturePoints, 9)}${pad(item.size.rebars, 6)}` +
        `${pad(item.timings.mesh.minMs.toFixed(1), 10)}${pad(item.timings.surface.minMs.toFixed(1), 10)}` +
        `${pad(item.timings.contour.minMs.toFixed(2), 9)}${pad(item.timings.inverse.minMs.toFixed(1), 9)}`
    )
  }

  const totals = report.cases.reduce(
    (sum, item) => ({
      mesh: sum.mesh + item.timings.mesh.minMs,
      surface: sum.surface + item.timings.surface.minMs,
      contour: sum.contour + item.timings.contour.minMs,
      inverse: sum.inverse + item.timings.inverse.minMs
    }),
    { mesh: 0, surface: 0, contour: 0, inverse: 0 }
  )
  console.log(
    `${pad('TOTAL', 22, true)}${pad('', 9)}${pad('', 8)}${pad('', 8)}${pad('', 9)}${pad('', 6)}` +
      `${pad(totals.mesh.toFixed(1), 10)}${pad(totals.surface.toFixed(1), 10)}` +
      `${pad(totals.contour.toFixed(2), 9)}${pad(totals.inverse.toFixed(1), 9)}`
  )
  const preparedWorkflow = report.cases.reduce(
    (sum, item) =>
      sum +
      item.timings.prepare.minMs +
      item.timings.surfacePrepared.minMs +
      item.timings.contour.minMs +
      item.timings.inversePrepared.minMs,
    0
  )
  console.log(`\n  prepared/cached workflow total: ${preparedWorkflow.toFixed(1)} ms`)

  const fingerprintOut = arg('fingerprint-out')
  if (fingerprintOut) {
    // Timings are machine specific and would churn the diff on every run; the gate only needs the
    // numbers the kernel produced.
    const artefact = {
      note: 'Capacity fingerprint of the analysis kernel. Regenerate with `npm run bench:record`.',
      cases: report.cases.map((item) => ({ key: item.key, size: item.size, fingerprint: item.fingerprint }))
    }
    writeFileSync(fingerprintOut, `${JSON.stringify(artefact, null, 0)}\n`, 'utf8')
    console.log(`\nwrote ${fingerprintOut}`)
  }

  const out = arg('out')
  if (out) {
    writeFileSync(out, `${JSON.stringify(report, null, 0)}\n`, 'utf8')
    console.log(`\nwrote ${out}`)
  }

  const baselinePath = arg('baseline')
  if (!baselinePath) return

  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as BenchReport
  const hasTimings = baseline.cases.every((item) => item.timings?.mesh)
  if (!hasTimings) {
    console.log(`\nBaseline ${baselinePath} carries fingerprints only; skipping the speed-up table.`)
  }
  if (hasTimings) {
  console.log(`\nSpeed-up vs ${baselinePath} (min-of-N, higher is better)\n`)
  console.log(
    `${pad('case', 22, true)}${pad('mesh', 20)}${pad('surface', 22)}${pad('contour', 20)}${pad('inverse', 20)}`
  )

  const ratio = (label: Stage, item: CaseReport, base: CaseReport) => {
    const now = item.timings[label].minMs
    const then = base.timings[label].minMs
    return `${then.toFixed(1)}→${now.toFixed(1)} ${then / now >= 1 ? '×' : '÷'}${(then / now >= 1 ? then / now : now / then).toFixed(2)}`
  }

  for (const item of report.cases) {
    const base = baseline.cases.find((entry) => entry.key === item.key)
    if (!base) continue
    console.log(
      `${pad(item.key, 22, true)}${pad(ratio('mesh', item, base), 20)}${pad(ratio('surface', item, base), 22)}` +
        `${pad(ratio('contour', item, base), 20)}${pad(ratio('inverse', item, base), 20)}`
    )
  }

  const baseTotals = baseline.cases.reduce(
    (sum, item) => ({
      mesh: sum.mesh + item.timings.mesh.minMs,
      surface: sum.surface + item.timings.surface.minMs
    }),
    { mesh: 0, surface: 0 }
  )
  console.log(
    `\n  total mesh    ${baseTotals.mesh.toFixed(1)} → ${totals.mesh.toFixed(1)} ms  ×${(baseTotals.mesh / totals.mesh).toFixed(2)}`
  )
  console.log(
    `  total surface ${baseTotals.surface.toFixed(1)} → ${totals.surface.toFixed(1)} ms  ×${(baseTotals.surface / totals.surface).toFixed(2)}`
  )
  const baseWorkflow = baseline.cases.reduce(
    (sum, item) =>
      sum +
      item.timings.surface.minMs +
      item.timings.contour.minMs +
      item.timings.inverse.minMs,
    0
  )
  console.log(
    `  end-to-end    ${baseWorkflow.toFixed(1)} → ${preparedWorkflow.toFixed(1)} ms  ×${(
      baseWorkflow / preparedWorkflow
    ).toFixed(2)} (surface + contour + one inverse solve)`
  )
  }

  const allDeviations = compareFingerprints(baseline, report)
  // Newton's analytic tangent and tighter residual criterion intentionally move the approximate
  // inverse state closer to equilibrium. Capacity, mesh, contours, utilization and pass/fail flags
  // must remain invariant; iteration-path diagnostics are reported separately rather than falsely
  // treated as a capacity regression.
  const solverDiagnostics = new Set([
    'inverseState',
    'inverseResponse',
    'inverseResidualNorm',
    'inverseIterations',
    'inverseAdmissibility'
  ])
  const deviations = allDeviations.filter((item) => !solverDiagnostics.has(item.quantity))
  console.log(`\nCapacity/result fidelity — tolerance ${TOL === 0 ? 'bit-identical' : TOL.toExponential(1)}\n`)

  if (deviations.length === 0) {
    const quantities = Object.keys(report.cases[0]?.fingerprint ?? {}).filter(
      (quantity) => !solverDiagnostics.has(quantity)
    ).length
    console.log(`  IDENTICAL — ${report.cases.length} sections × ${quantities} capacity quantities, no bit changed.`)
  } else {
    for (const deviation of deviations.slice(0, 40)) {
      console.log(
        `  ${pad(deviation.caseKey, 22, true)}${pad(deviation.quantity, 24, true)}` +
          `rel=${deviation.relative.toExponential(3)}  ${deviation.detail}`
      )
    }
    if (deviations.length > 40) console.log(`  … and ${deviations.length - 40} more`)

    const worst = deviations[0].relative
    console.log(`\n  worst relative deviation: ${worst.toExponential(3)}`)
    if (worst > TOL) {
      console.log(`  FAIL — exceeds the ${TOL === 0 ? 'bit-identical' : TOL.toExponential(1)} tolerance.`)
      process.exitCode = 1
    } else {
      console.log('  within tolerance.')
    }
  }

  const equilibriumError = (item: CaseReport) => {
    const benchCase = BENCH_CASES.find((candidate) => candidate.key === item.key)!
    const response = item.fingerprint.inverseResponse as number[]
    const forceScale = Math.max(...(item.fingerprint.surfaceP as number[]).map(Math.abs), 1)
    const momentScale = Math.max(
      ...(item.fingerprint.surfaceMx as number[]).map(Math.abs),
      ...(item.fingerprint.surfaceMy as number[]).map(Math.abs),
      1
    )
    return Math.max(
      Math.abs(response[0] - benchCase.demand.P) / forceScale,
      Math.abs(response[1] - benchCase.demand.Mx) / momentScale,
      Math.abs(response[2] - benchCase.demand.My) / momentScale
    )
  }
  const residuals = report.cases.map((item) => {
    const base = baseline.cases.find((candidate) => candidate.key === item.key)!
    return { key: item.key, before: equilibriumError(base), after: equilibriumError(item) }
  })
  console.log('\nInverse equilibrium error (capacity-scaled; lower is better)\n')
  for (const residual of residuals) {
    console.log(
      `  ${pad(residual.key, 22, true)}${residual.before.toExponential(3)} → ${residual.after.toExponential(3)}`
    )
  }
}

run()
