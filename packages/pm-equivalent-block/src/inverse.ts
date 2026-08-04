import {
  EquivalentBlockInputError,
  type BlockSectionState,
  type CapacityResultants,
  type PreparedEquivalentBlockSection,
  type SteelLawRegistry
} from './types'
import {
  intersectCapacitySurfaceWithRay,
  type CapacityEvaluator,
  type CapacityStation,
  type CapacitySurface,
  type SurfaceRayIntersection
} from './surface'
import { projectedOuterExtents } from './geometry'

const TAU = Math.PI * 2

const wrapAngle = (angle: number) => {
  const wrapped = angle % TAU
  return wrapped < 0 ? wrapped + TAU : wrapped
}

export type RootResult = {
  root: number
  value: number
  iterations: number
}

export const brentRoot = (
  evaluate: (value: number) => number,
  lower: number,
  upper: number,
  tolerance = 1e-10,
  maxIterations = 100
): RootResult => {
  let a = lower
  let b = upper
  let fa = evaluate(a)
  let fb = evaluate(b)
  if (!Number.isFinite(fa) || !Number.isFinite(fb) || fa * fb > 0) {
    throw new EquivalentBlockInputError('SOLVER_INPUT', 'Brent solver requires a finite sign-changing bracket.')
  }
  if (fa === 0) return { root: a, value: fa, iterations: 0 }
  if (fb === 0) return { root: b, value: fb, iterations: 0 }
  if (Math.abs(fa) < Math.abs(fb)) {
    ;[a, b] = [b, a]
    ;[fa, fb] = [fb, fa]
  }
  let c = a
  let fc = fa
  let d = c
  let mflag = true
  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    let s: number
    if (fa !== fc && fb !== fc) {
      s =
        a * fb * fc / ((fa - fb) * (fa - fc)) +
        b * fa * fc / ((fb - fa) * (fb - fc)) +
        c * fa * fb / ((fc - fa) * (fc - fb))
    } else {
      s = b - fb * (b - a) / (fb - fa)
    }
    const lowerBound = Math.min((3 * a + b) / 4, b)
    const upperBound = Math.max((3 * a + b) / 4, b)
    const condition1 = s <= lowerBound || s >= upperBound
    const condition2 = mflag && Math.abs(s - b) >= Math.abs(b - c) / 2
    const condition3 = !mflag && Math.abs(s - b) >= Math.abs(c - d) / 2
    const condition4 = mflag && Math.abs(b - c) < tolerance
    const condition5 = !mflag && Math.abs(c - d) < tolerance
    if (condition1 || condition2 || condition3 || condition4 || condition5 || !Number.isFinite(s)) {
      s = (a + b) / 2
      mflag = true
    } else {
      mflag = false
    }
    const fs = evaluate(s)
    if (!Number.isFinite(fs)) throw new EquivalentBlockInputError('SOLVER_INPUT', 'Root evaluator returned a non-finite value.')
    d = c
    c = b
    fc = fb
    if (fa * fs < 0) {
      b = s
      fb = fs
    } else {
      a = s
      fa = fs
    }
    if (Math.abs(fa) < Math.abs(fb)) {
      ;[a, b] = [b, a]
      ;[fa, fb] = [fb, fa]
    }
    if (Math.abs(fb) <= tolerance || Math.abs(b - a) <= tolerance) {
      return { root: b, value: fb, iterations: iteration }
    }
  }
  return { root: b, value: fb, iterations: maxIterations }
}

export type FixedAxialSolverOptions = {
  angleSamples?: number
  depthSamples?: number
  minDepthRatio?: number
  maxDepthRatio?: number
  depthTolerance?: number
  angleTolerance?: number
  residualTolerance?: number
  axialCap?: number
  eventStations?: CapacityStation[]
  extremeCompressionStrain?: number
  steelLaws?: SteelLawRegistry
}

type AxialRoot = {
  state: BlockSectionState
  evaluation: ReturnType<CapacityEvaluator>
  axialResidual: number
  innerIterations: number
}

export type FixedAxialCapacityResult = {
  status: 'converged' | 'no-capacity' | 'multiple-branches'
  utilization?: number
  capacityFactor?: number
  state?: BlockSectionState
  capacity?: CapacityResultants
  axialResidual?: number
  directionResidual?: number
  branchesExamined: number
  innerIterations: number
  outerIterations: number
}

const logSpace = (minimum: number, maximum: number, count: number) => {
  const minLog = Math.log(minimum)
  const maxLog = Math.log(maximum)
  return Array.from({ length: count }, (_, index) => Math.exp(minLog + (maxLog - minLog) * index / (count - 1)))
}

export const solveFixedAxialCapacity = (
  section: PreparedEquivalentBlockSection,
  evaluator: CapacityEvaluator,
  targetAxial: number,
  momentDirection: { Mx: number; My: number },
  options: FixedAxialSolverOptions = {}
): FixedAxialCapacityResult => {
  const momentMagnitude2 = momentDirection.Mx ** 2 + momentDirection.My ** 2
  if (!Number.isFinite(targetAxial) || !Number.isFinite(momentDirection.Mx) || !Number.isFinite(momentDirection.My) || momentMagnitude2 <= 0) {
    throw new EquivalentBlockInputError('SOLVER_INPUT', 'Fixed-axial inverse requires finite axial force and a nonzero moment direction.')
  }
  if (options.axialCap !== undefined && targetAxial > options.axialCap * (1 + 1e-10)) {
    return { status: 'no-capacity', branchesExamined: 0, innerIterations: 0, outerIterations: 0 }
  }
  const angleSamples = Math.max(12, Math.round(options.angleSamples ?? 96))
  const depthSamples = Math.max(16, Math.round(options.depthSamples ?? 96))
  const minDepthRatio = options.minDepthRatio ?? 1e-4
  const maxDepthRatio = options.maxDepthRatio ?? 1e3
  const depthTolerance = options.depthTolerance ?? 1e-9
  const angleTolerance = options.angleTolerance ?? 1e-10
  const residualTolerance = options.residualTolerance ?? 1e-8
  const extremeCompressionStrain = options.extremeCompressionStrain ?? 0.003
  if (!(minDepthRatio > 0) || !(maxDepthRatio > minDepthRatio) || !(extremeCompressionStrain > 0)) {
    throw new EquivalentBlockInputError('SOLVER_INPUT', 'Fixed-axial depth bounds and extreme compression strain must be positive and ordered.')
  }
  const axialScale = Math.max(1, Math.abs(targetAxial), Math.abs(options.axialCap ?? 0))
  let totalInnerIterations = 0

  const rootsAt = (sourceAngle: number): AxialRoot[] => {
    const angle = wrapAngle(sourceAngle)
    const normalX = Math.cos(angle)
    const normalY = Math.sin(angle)
    const extents = projectedOuterExtents(section, normalX, normalY)
    const depth = extents.depth
    const ratios = logSpace(minDepthRatio, maxDepthRatio, depthSamples)
    const barDepths = options.steelLaws ? section.rebars.map((bar) => {
      const steelLaw = options.steelLaws![bar.steelLawId]
      if (!steelLaw) {
        throw new EquivalentBlockInputError('MISSING_STEEL_LAW', `Steel law ${bar.steelLawId} is not registered.`)
      }
      return {
        depth: extents.maximum - (normalX * bar.x + normalY * bar.y),
        yieldStrain: steelLaw.yieldStrain,
        ultimateStrain: steelLaw.ultimateStrain
      }
    }) : []
    const eventDepths = (options.eventStations ?? []).map((station) => {
      if (station.type === 'depth-ratio') return station.ratio * depth
      const controllingBar = barDepths.reduce<(typeof barDepths)[number] | undefined>(
        (current, bar) => !current || bar.depth > current.depth ? bar : current,
        undefined
      )
      const controllingDepth = station.type === 'bar-tension-strain' && controllingBar
        ? controllingBar.depth
        : depth
      const requestedDepth = controllingDepth / (1 + station.strain / extremeCompressionStrain)
      const ruptureDepth = barDepths.reduce((minimum, bar) => bar.ultimateStrain === undefined
        ? minimum
        : Math.max(minimum, bar.depth / (1 + bar.ultimateStrain / extremeCompressionStrain)), 0)
      return Math.max(requestedDepth, ruptureDepth)
    })
    const depths = [...ratios.map((ratio) => ratio * depth), ...eventDepths]
      .filter((value) => value > 0 && Number.isFinite(value))
      .sort((left, right) => left - right)
      .filter((value, index, values) => index === 0 || Math.abs(Math.log(value / values[index - 1])) > 1e-10)
    const evaluateResidual = (neutralAxisDepth: number) =>
      evaluator({ neutralAxisAngle: angle, neutralAxisDepth }).resultants.P - targetAxial
    const residuals = depths.map(evaluateResidual)
    const roots: AxialRoot[] = []
    const recordRoot = (rootDepth: number, iterations: number) => {
      if (roots.some((root) => Math.abs(Math.log(root.state.neutralAxisDepth / rootDepth)) < 1e-7)) return
      const evaluation = evaluator({ neutralAxisAngle: angle, neutralAxisDepth: rootDepth })
      roots.push({
        state: { neutralAxisAngle: angle, neutralAxisDepth: rootDepth },
        evaluation,
        axialResidual: evaluation.resultants.P - targetAxial,
        innerIterations: iterations
      })
      totalInnerIterations += iterations
    }
    for (let index = 0; index < depths.length - 1; index += 1) {
      const leftResidual = residuals[index]
      const rightResidual = residuals[index + 1]
      if (!Number.isFinite(leftResidual) || !Number.isFinite(rightResidual)) continue
      let rootDepth: number | undefined
      let iterations = 0
      if (Math.abs(leftResidual) <= residualTolerance * axialScale) rootDepth = depths[index]
      else if (leftResidual * rightResidual < 0) {
        const root = brentRoot(
          evaluateResidual,
          depths[index],
          depths[index + 1],
          depthTolerance * Math.max(1, depth),
          100
        )
        rootDepth = root.root
        iterations = root.iterations
      }
      if (rootDepth !== undefined) recordRoot(rootDepth, iterations)
    }
    const lastIndex = depths.length - 1
    if (Math.abs(residuals[lastIndex]) <= residualTolerance * axialScale) recordRoot(depths[lastIndex], 0)
    return roots.sort((left, right) => left.state.neutralAxisDepth - right.state.neutralAxisDepth)
  }

  const sampleAngles = Array.from({ length: angleSamples }, (_, index) => TAU * index / angleSamples)
  const sampleRoots = sampleAngles.map(rootsAt)
  const candidates: Array<AxialRoot & { directionResidual: number; outerIterations: number; factor: number }> = []
  const directionResidual = (root: AxialRoot) =>
    root.evaluation.resultants.Mx * momentDirection.My - root.evaluation.resultants.My * momentDirection.Mx
  const addCandidate = (root: AxialRoot, outerIterations: number) => {
    const factor = (
      root.evaluation.resultants.Mx * momentDirection.Mx +
      root.evaluation.resultants.My * momentDirection.My
    ) / momentMagnitude2
    if (!(factor > 0) || !Number.isFinite(factor)) return
    if (candidates.some((candidate) =>
      Math.abs(candidate.factor - factor) <= 1e-7 * Math.max(1, factor) &&
      Math.min(
        wrapAngle(candidate.state.neutralAxisAngle - root.state.neutralAxisAngle),
        TAU - wrapAngle(candidate.state.neutralAxisAngle - root.state.neutralAxisAngle)
      ) <= 1e-6
    )) return
    candidates.push({ ...root, directionResidual: directionResidual(root), outerIterations, factor })
  }
  for (const roots of sampleRoots) {
    for (const root of roots) {
      const momentScale = Math.max(1, Math.hypot(root.evaluation.resultants.Mx, root.evaluation.resultants.My) * Math.sqrt(momentMagnitude2))
      if (Math.abs(directionResidual(root)) <= residualTolerance * momentScale) addCandidate(root, 0)
    }
  }

  let branchesExamined = 0
  let totalOuterIterations = 0
  for (let angleIndex = 0; angleIndex < angleSamples; angleIndex += 1) {
    const nextIndex = (angleIndex + 1) % angleSamples
    const leftAngle = sampleAngles[angleIndex]
    const rightAngle = nextIndex === 0 ? TAU : sampleAngles[nextIndex]
    const leftRoots = sampleRoots[angleIndex]
    const rightRoots = sampleRoots[nextIndex]
    const usedRight = new Set<number>()
    for (const leftRoot of leftRoots) {
      let pairedIndex = -1
      let pairedDistance = Number.POSITIVE_INFINITY
      rightRoots.forEach((rightRoot, index) => {
        if (usedRight.has(index)) return
        const candidateDistance = Math.abs(Math.log(rightRoot.state.neutralAxisDepth / leftRoot.state.neutralAxisDepth))
        if (candidateDistance < pairedDistance) {
          pairedDistance = candidateDistance
          pairedIndex = index
        }
      })
      if (pairedIndex < 0) continue
      usedRight.add(pairedIndex)
      const rightRoot = rightRoots[pairedIndex]
      const leftValue = directionResidual(leftRoot)
      const rightValue = directionResidual(rightRoot)
      branchesExamined += 1
      if (leftValue * rightValue >= 0) continue
      const branchAt = (angle: number) => {
        const fraction = (angle - leftAngle) / (rightAngle - leftAngle)
        const targetLogDepth =
          Math.log(leftRoot.state.neutralAxisDepth) * (1 - fraction) +
          Math.log(rightRoot.state.neutralAxisDepth) * fraction
        const roots = rootsAt(angle)
        if (roots.length === 0) throw new EquivalentBlockInputError('SOLVER_INPUT', 'A fixed-axial branch disappeared during angle refinement.')
        return roots.reduce((best, root) =>
          Math.abs(Math.log(root.state.neutralAxisDepth) - targetLogDepth) <
          Math.abs(Math.log(best.state.neutralAxisDepth) - targetLogDepth) ? root : best
        )
      }
      let outer: RootResult
      try {
        outer = brentRoot(
          (angle) => directionResidual(branchAt(angle)),
          leftAngle,
          rightAngle,
          angleTolerance,
          80
        )
      } catch (error) {
        if (error instanceof EquivalentBlockInputError && error.message.includes('branch disappeared')) continue
        throw error
      }
      totalOuterIterations += outer.iterations
      addCandidate(branchAt(outer.root), outer.iterations)
    }
  }

  if (candidates.length === 0) {
    return {
      status: 'no-capacity',
      branchesExamined,
      innerIterations: totalInnerIterations,
      outerIterations: totalOuterIterations
    }
  }
  const governing = candidates.reduce((best, candidate) => candidate.factor < best.factor ? candidate : best)
  return {
    status: candidates.length > 1 ? 'multiple-branches' : 'converged',
    utilization: 1 / governing.factor,
    capacityFactor: governing.factor,
    state: governing.state,
    capacity: governing.evaluation.resultants,
    axialResidual: governing.axialResidual,
    directionResidual: governing.directionResidual,
    branchesExamined,
    innerIterations: totalInnerIterations,
    outerIterations: totalOuterIterations
  }
}

const solveLinear3 = (matrix: number[][], vector: number[]) => {
  const augmented = matrix.map((row, index) => [...row, vector[index]])
  for (let pivot = 0; pivot < 3; pivot += 1) {
    let best = pivot
    for (let row = pivot + 1; row < 3; row += 1) {
      if (Math.abs(augmented[row][pivot]) > Math.abs(augmented[best][pivot])) best = row
    }
    ;[augmented[pivot], augmented[best]] = [augmented[best], augmented[pivot]]
    if (Math.abs(augmented[pivot][pivot]) < 1e-18) return null
    const divisor = augmented[pivot][pivot]
    for (let column = pivot; column < 4; column += 1) augmented[pivot][column] /= divisor
    for (let row = 0; row < 3; row += 1) {
      if (row === pivot) continue
      const factor = augmented[row][pivot]
      for (let column = pivot; column < 4; column += 1) augmented[row][column] -= factor * augmented[pivot][column]
    }
  }
  return augmented.map((row) => row[3])
}

export type ProportionalRaySolverOptions = {
  maxIterations?: number
  residualTolerance?: number
  initialDamping?: number
  minDepth?: number
  maxDepth?: number
}

export type ProportionalRayCapacityResult = {
  status: 'converged' | 'mesh-fallback' | 'no-intersection' | 'cap-face-governed'
  loadFactor?: number
  utilization?: number
  capacity?: CapacityResultants
  state?: BlockSectionState
  residualNorm?: number
  iterations: number
  surfaceIntersection?: SurfaceRayIntersection
  /** Last coherent physical evaluation from an unsuccessful exact refinement. */
  refinement?: {
    state: BlockSectionState
    loadFactor: number
    capacity: CapacityResultants
    residual: CapacityResultants
    residualNorm: number
  }
}

const seedStateFromIntersection = (surface: CapacitySurface, intersection: SurfaceRayIntersection) => {
  const triangle = surface.triangles[intersection.triangleIndex]
  const vertices = [surface.points[triangle.a], surface.points[triangle.b], surface.points[triangle.c]]
  const [w0, w1, w2] = intersection.barycentric
  const weights = [w0, w1, w2]
  const stateVertices = vertices.map((vertex, index) => ({ vertex, weight: weights[index] }))
    .filter((entry) => entry.vertex.state)
  if (stateVertices.length === 0) return null
  const weightSum = stateVertices.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0)
  const normalizedWeight = (weight: number) => weightSum > 1e-14 ? Math.max(0, weight) / weightSum : 1 / stateVertices.length
  const cosine = stateVertices.reduce((sum, entry) =>
    sum + Math.cos(entry.vertex.state!.neutralAxisAngle) * normalizedWeight(entry.weight), 0)
  const sine = stateVertices.reduce((sum, entry) =>
    sum + Math.sin(entry.vertex.state!.neutralAxisAngle) * normalizedWeight(entry.weight), 0)
  const neutralAxisDepth = stateVertices.reduce((sum, entry) =>
    sum + entry.vertex.state!.neutralAxisDepth * normalizedWeight(entry.weight), 0)
  return { neutralAxisAngle: wrapAngle(Math.atan2(sine, cosine)), neutralAxisDepth }
}

export const solveProportionalRayCapacity = (
  surface: CapacitySurface,
  demand: CapacityResultants,
  evaluator?: CapacityEvaluator,
  options: ProportionalRaySolverOptions = {}
): ProportionalRayCapacityResult => {
  const intersection = intersectCapacitySurfaceWithRay(surface, demand)
  if (!intersection) return { status: 'no-intersection', iterations: 0 }
  const triangle = surface.triangles[intersection.triangleIndex]
  const onCapFace = [triangle.a, triangle.b, triangle.c].every((index) =>
    surface.points[index].kind === 'axial-cap'
  )
  if (onCapFace) {
    return {
      status: 'cap-face-governed',
      loadFactor: intersection.loadFactor,
      utilization: 1 / intersection.loadFactor,
      capacity: intersection.point,
      iterations: 0,
      surfaceIntersection: intersection
    }
  }
  const seed = seedStateFromIntersection(surface, intersection)
  if (!seed) {
    return {
      status: 'mesh-fallback',
      loadFactor: intersection.loadFactor,
      utilization: 1 / intersection.loadFactor,
      capacity: intersection.point,
      iterations: 0,
      surfaceIntersection: intersection
    }
  }
  if (!evaluator) {
    return {
      status: 'mesh-fallback',
      loadFactor: intersection.loadFactor,
      utilization: 1 / intersection.loadFactor,
      capacity: intersection.point,
      state: seed,
      iterations: 0,
      surfaceIntersection: intersection
    }
  }

  const scale = surface.normalization
  const maxIterations = Math.max(1, Math.round(options.maxIterations ?? 30))
  const residualTolerance = options.residualTolerance ?? 1e-9
  const minDepth = options.minDepth ?? 1e-8
  const maxDepth = options.maxDepth ?? 1e12
  let values = [seed.neutralAxisAngle, Math.log(seed.neutralAxisDepth), intersection.loadFactor]
  let damping = options.initialDamping ?? 1e-4
  const residualAt = (candidate: number[]) => {
    const state = {
      neutralAxisAngle: wrapAngle(candidate[0]),
      neutralAxisDepth: Math.min(maxDepth, Math.max(minDepth, Math.exp(candidate[1])))
    }
    const evaluation = evaluator(state)
    return {
      state,
      evaluation,
      residual: [
        (evaluation.resultants.P - candidate[2] * demand.P) / scale.P,
        (evaluation.resultants.Mx - candidate[2] * demand.Mx) / scale.Mx,
        (evaluation.resultants.My - candidate[2] * demand.My) / scale.My
      ]
    }
  }
  let current = residualAt(values)
  let norm = Math.hypot(...current.residual)
  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    if (norm <= residualTolerance) {
      return {
        status: 'converged',
        loadFactor: values[2],
        utilization: 1 / values[2],
        capacity: current.evaluation.resultants,
        state: current.state,
        residualNorm: norm,
        iterations: iteration - 1,
        surfaceIntersection: intersection
      }
    }
    const jacobian = Array.from({ length: 3 }, () => [0, 0, 0])
    for (let column = 0; column < 3; column += 1) {
      const step = 1e-6 * Math.max(1, Math.abs(values[column]))
      const plus = [...values]
      const minus = [...values]
      plus[column] += step
      minus[column] -= step
      const plusResidual = residualAt(plus).residual
      const minusResidual = residualAt(minus).residual
      for (let row = 0; row < 3; row += 1) jacobian[row][column] = (plusResidual[row] - minusResidual[row]) / (2 * step)
    }
    const normalMatrix = Array.from({ length: 3 }, (_, row) => Array.from({ length: 3 }, (_, column) =>
      jacobian.reduce((sum, jacobianRow) => sum + jacobianRow[row] * jacobianRow[column], 0) + (row === column ? damping : 0)
    ))
    const gradient = Array.from({ length: 3 }, (_, column) =>
      -jacobian.reduce((sum, jacobianRow, row) => sum + jacobianRow[column] * current.residual[row], 0)
    )
    const delta = solveLinear3(normalMatrix, gradient)
    if (!delta) {
      damping *= 10
      continue
    }
    delta[0] = Math.max(-0.25, Math.min(0.25, delta[0]))
    delta[1] = Math.max(-0.5, Math.min(0.5, delta[1]))
    delta[2] = Math.max(-Math.max(0.1, values[2] * 0.5), Math.min(Math.max(0.1, values[2] * 0.5), delta[2]))
    const candidateValues = [wrapAngle(values[0] + delta[0]), values[1] + delta[1], Math.max(1e-12, values[2] + delta[2])]
    const candidate = residualAt(candidateValues)
    const candidateNorm = Math.hypot(...candidate.residual)
    if (candidateNorm < norm) {
      values = candidateValues
      current = candidate
      norm = candidateNorm
      damping = Math.max(1e-12, damping / 3)
    } else {
      damping = Math.min(1e12, damping * 10)
    }
  }
  return {
    status: 'mesh-fallback',
    loadFactor: intersection.loadFactor,
    utilization: 1 / intersection.loadFactor,
    capacity: intersection.point,
    residualNorm: norm,
    iterations: maxIterations,
    surfaceIntersection: intersection,
    refinement: {
      state: current.state,
      loadFactor: values[2],
      capacity: current.evaluation.resultants,
      residual: {
        P: current.evaluation.resultants.P - values[2] * demand.P,
        Mx: current.evaluation.resultants.Mx - values[2] * demand.Mx,
        My: current.evaluation.resultants.My - values[2] * demand.My
      },
      residualNorm: norm
    }
  }
}
