import type { MaterialStore } from '@pm/materials'
import type { DesignBasis } from '@pm/design'
import type { DemandCheckBasis, LoadCombination } from '@pm/project'
import { analysisStations, intersectSurfaceAtConstantAxial, intersectSurfaceWithDemandRay, createCapacityFieldEvaluator,
  solveDirect2DLoadcase, solveInversePreviewFromPrepared, buildExactDirectionCurveFromPrepared, sliceActiveDesignPContour,
  activeDesignDirectionPoints, buildDemandPmGeometry, strainGradientDirection,
  type CapacityFieldResult, type ExactDirectionCurve, type PreparedAnalysis, type PreviewSurface, type StationDefinition } from './index'
import { solve3 } from './linear-solve'
import { NEWTON_RESIDUAL_TOL, NEWTON_MAX_ITERATIONS } from './inverse-options'

export const solveStressStrainDirect2DFromPrepared = (
  prepared: PreparedAnalysis, materials: MaterialStore, basis: DesignBasis, surface: PreviewSurface, loadcase: LoadCombination
) => {
  const options = surface.analysisOptions
  if (options.methodId !== 'strain-domain-surface-v1') throw new TypeError('Expected stress-strain analysis options.')
  return solveDirect2DLoadcase(surface, loadcase, demand => {
    const inverse = solveInversePreviewFromPrepared(prepared, demand, sliceActiveDesignPContour(surface, demand.P))
    if (inverse.ok && inverse.admissibility.evaluated && inverse.admissibility.ok &&
      strainGradientDirection(inverse.state) !== null) return inverse
    try {
      return { ...inverse, capacityField: solveStressStrainCapacityFieldFromPrepared(prepared, materials, basis, surface, demand) }
    } catch {
      return inverse
    }
  }, beta => buildExactDirectionCurveFromPrepared(prepared, materials, basis, options, beta),
  (demand, curve) => solveDirect2DPhysicalField(prepared, materials, basis, surface, demand, curve))
}

/** Refine the physical station coordinate with beta fixed and residual in P–MR. */
const solveDirect2DPhysicalField = (
  prepared: PreparedAnalysis, materials: MaterialStore, basis: DesignBasis,
  surface: PreviewSurface, demand: LoadCombination, curve: ExactDirectionCurve
): CapacityFieldResult => {
  const unavailable = (message: string, iterations = 0): CapacityFieldResult =>
    ({ status: 'unavailable', reason: 'non-converged', iterations, message })
  const query = (exact: ExactDirectionCurve) => buildDemandPmGeometry({
    surface, exact, inspectionBeta: exact.beta, demand, governingPoint: null, basis: 'direct2D', showTheta: false
  })
  let exact = curve, geometry = query(exact)
  const cap = curve.beforeAxialCap ? surface.bounds.P[1] : null
  const onCap = cap !== null && geometry.summary.status === 'available' && geometry.summary.resistance.P >= cap
  if (onCap && curve.beforeAxialCap) {
    exact = { ...curve, designCurve: curve.beforeAxialCap }
    geometry = query(exact)
  }
  const source = geometry.diagnostic.points[0]?.sources[0]
  if (geometry.summary.status !== 'available' || !source) return unavailable('No unique physical station bracket is available.')
  const path = geometry.design[source.path]
  const points = activeDesignDirectionPoints(exact)
  const definition = (id: string | null) => {
    const point = points.find(item => item.id === id)
    if (!point || point.surfaceRole !== 'physical-state') return undefined
    return exact.stations.find(station => station.id === point.stationId)?.definition
  }
  const left = definition(path[source.segment].sourceId), right = definition(path[source.segment + 1].sourceId)
  const pole = exact.nominalFixed.find(point => point.surfaceRole === 'pure-tension')
  if (!left || !right || !pole) return unavailable('The 2D crossing has no admissible physical station bracket.')
  const evaluate = createCapacityFieldEvaluator(prepared, materials, basis, pole.state.e0)
  const pScale = Math.max(1, ...surface.bounds.P.map(Math.abs))
  const mScale = Math.max(1, ...surface.bounds.Mx.map(Math.abs), ...surface.bounds.My.map(Math.abs))
  const dp = demand.P / pScale, dm = Math.hypot(demand.Mx, demand.My) / mScale
  const length = Math.hypot(dp, dm)
  if (!(length > 0) || !Number.isFinite(length)) return unavailable('The physical 2D ray is undefined.')
  const up = dp / length, um = dm / length
  const trial = (ratio: number) => {
    const { point, admissibility } = evaluate(exact.beta, ratio === 0 ? left : ratio === 1 ? right
      : { kind: 'adaptive-state-interpolation', left, right, ratio }, ratio)
    const p = point.P / pScale, m = Math.hypot(point.Mx, point.My) / mScale
    return { point, admissibility, distance: p * um - m * up, lambda: (p * up + m * um) / length }
  }
  let lo = 0, hi = 1
  let a = trial(lo), b = trial(hi)
  for (let iteration = 0; iteration <= NEWTON_MAX_ITERATIONS; iteration++) {
    const hit = Math.abs(a.distance) <= NEWTON_RESIDUAL_TOL ? a : Math.abs(b.distance) <= NEWTON_RESIDUAL_TOL ? b : null
    if (hit) {
      const { point, admissibility, lambda, distance } = hit
      if (!admissibility.evaluated || !admissibility.ok || !Number.isFinite(lambda) || lambda <= 0 ||
        (onCap && cap !== null && point.P <= cap)) break
      const mr = Math.hypot(point.Mx, point.My)
      const targetMr = lambda * Math.hypot(demand.Mx, demand.My)
      const mrResidual = mr - targetMr
      return { status: 'available', state: point.state, response: { P: point.P, Mx: point.Mx, My: point.My },
        boundary: cap !== null && point.P > cap ? { kind: 'before-axial-cap', limit: cap } : { kind: 'design' },
        // The 2D residual is radial in the capacity moment direction.
        loadFactor: lambda, residual: { P: point.P - lambda * demand.P,
          Mx: mr ? mrResidual * (point.Mx / mr) : 0, My: mr ? mrResidual * (point.My / mr) : 0 },
        residualNorm: Math.abs(distance), iterations: iteration, admissibility, resistance: point.resistance ?? null,
        message: 'Compatible physical capacity on the fixed neutral-axis P–MR ray.' }
    }
    if (!Number.isFinite(a.distance) || !Number.isFinite(b.distance) || Math.sign(a.distance) === Math.sign(b.distance)) break
    const mid = (lo + hi) / 2, c = trial(mid)
    if (Math.sign(c.distance) === Math.sign(a.distance)) { lo = mid; a = c } else { hi = mid; b = c }
  }
  return unavailable('A compatible physical state on the fixed neutral-axis 2D ray did not converge.')
}

/**
 * docs/04 §10: refine a physical Design boundary state for display only. The triangulated crossing
 * and its UR remain authoritative; an interpolated strain plane is only a numerical seed.
 */
export const solveStressStrainCapacityFieldFromPrepared = (
  prepared: PreparedAnalysis,
  sourceMaterials: MaterialStore,
  basis: DesignBasis,
  surface: PreviewSurface,
  checkedDemand: LoadCombination,
  checkBasis: DemandCheckBasis = 'proportional3D'
): CapacityFieldResult => {
  const unavailable = (reason: Extract<CapacityFieldResult, { status: 'unavailable' }>['reason'],
    message: string, iterations = 0): CapacityFieldResult => ({ status: 'unavailable', reason, message, iterations })
  if (checkBasis === 'direct2D') return unavailable('invalid-input', 'Use the fixed neutral-axis capacity resolver.')
  if (![checkedDemand.P, checkedDemand.Mx, checkedDemand.My].every(Number.isFinite)) {
    return unavailable('invalid-input', 'Capacity-field demand components must be finite.')
  }
  const constantAxial = checkBasis === 'constantAxial'
  const constantCrossing = constantAxial ? intersectSurfaceAtConstantAxial(surface, checkedDemand) : null
  if (constantCrossing && constantCrossing.status !== 'crossing') {
    return unavailable('no-crossing', 'No unique constant-P Design-surface crossing is available.')
  }
  const governingIntersection = constantCrossing ? constantCrossing.intersection : intersectSurfaceWithDemandRay(surface, checkedDemand)
  if (!governingIntersection) return unavailable('no-crossing', 'No Design-surface ray crossing is available.')
  // A constant-P ray runs parallel to the cap, so it can only leave through a side face.
  const onCapFace = !constantAxial && (governingIntersection.source?.vertices.every(point => point.surfaceRole === 'axial-cap') ||
    (surface.beforeAxialCap && governingIntersection.source?.vertices.every(point => point.P === surface.bounds.P[1])))
  if (onCapFace && !surface.beforeAxialCap) {
    return unavailable('axial-cap', 'The original Design boundary before the axial cap is unavailable.')
  }
  // The capped domain still owns UR. Only this diagnostic query continues the same ray to the
  // original physical Design boundary, with its original topology rather than projected strains.
  const physicalSurface = onCapFace && surface.beforeAxialCap
    ? { ...surface, points: surface.beforeAxialCap.points, triangles: surface.beforeAxialCap.triangles }
    : surface
  const intersection = onCapFace ? intersectSurfaceWithDemandRay(physicalSurface, checkedDemand) : governingIntersection
  if (!intersection) return unavailable('no-crossing', 'No Design-surface ray crossing is available.')
  if (!Number.isFinite(intersection.lambda)) return unavailable('zero-demand', 'Zero demand has no unique capacity-field direction.')
  if (!intersection.source || surface.analysisOptions.methodId !== 'strain-domain-surface-v1') {
    return unavailable('non-converged', 'The physical capacity-field seed is unavailable.')
  }
  const { vertices, weights } = intersection.source
  const stations = analysisStations(surface.analysisOptions)
  const tensionPole = surface.nominalPoints.find(point => point.surfaceRole === 'pure-tension')
  if (!tensionPole || stations.length < 2) return unavailable('non-converged', 'The compatible station domain is unavailable.')
  const evaluateState = createCapacityFieldEvaluator(prepared, sourceMaterials, basis, tensionPole.state.e0)
  const forceScale = Math.max(1, Math.abs(surface.bounds.P[0]), Math.abs(surface.bounds.P[1]))
  const momentScale = Math.max(1, ...surface.bounds.Mx.map(Math.abs), ...surface.bounds.My.map(Math.abs))
  // Normalize the ray at its existing crossing, so scaling the entered demand cannot condition Newton.
  const target = intersection.point
  const scaledTarget = [target.P / forceScale, target.Mx / momentScale, target.My / momentScale]
  // The multiplier scales the whole target on a proportional ray, and only its moments at constant P.
  const multipliedTarget = constantAxial ? [0, scaledTarget[1], scaledTarget[2]] : scaledTarget
  const caps = surface.points.filter(point => point.surfaceRole === 'axial-cap')
  const cap = caps.length ? Math.max(...caps.map(point => point.P)) : null
  const declaredSteelLimit = prepared.rebarFibers.some(fiber => fiber.steel.limits.epsTensionUltimate !== undefined)
  const reachesSteelLimit = (state: { e0: number; kx: number; ky: number }) => prepared.rebarFibers.some(fiber => {
    const limit = fiber.steel.limits.epsTensionUltimate
    const strain = state.e0 + state.kx * fiber.y + state.ky * fiber.x
    return limit !== undefined && Math.abs((strain + limit) / limit) <= NEWTON_RESIDUAL_TOL
  })
  const evaluateAt = (values: readonly number[]) => {
    const [beta, coordinate, multiplier] = values
    if (!values.every(Number.isFinite) || multiplier <= 0 || coordinate < 0 || coordinate > stations.length - 1) return null
    const lower = Math.floor(coordinate)
    const upper = Math.min(lower + 1, stations.length - 1)
    const ratio = coordinate - lower
    let definition: StationDefinition = ratio === 0 ? stations[lower].definition
      : stations[upper].definition.kind === 'pure-tension'
        ? { kind: 'tension-pole-transition-ratio', from: stations[lower].definition, ratio }
        : { kind: 'adaptive-state-interpolation', left: stations[lower].definition,
            right: stations[upper].definition, ratio }
    // With no declared rupture limit, the assumed uniform-pole strain is not a material boundary.
    // Continue the existing concrete-limit branch toward c/D=0 instead of inventing steel rupture.
    if (definition.kind === 'tension-pole-transition-ratio') {
      const left = evaluateState(beta, definition.from, coordinate)
      if (!declaredSteelLimit) {
        const curvature = Math.hypot(left.point.state.kx, left.point.state.ky)
        if (!(curvature > 0 && left.projectedDepth > 0)) return null
        definition = { kind: 'neutral-axis-depth-ratio', ratio:
          (1 - ratio) * prepared.materialStore.concrete.limits.epsCu / (curvature * left.projectedDepth) }
      } else {
        const pivot = evaluateState(beta, { ...definition, ratio: 1 / 3 }, coordinate)
        const a = left.point.state; const b = pivot.point.state
        const sameState = Math.max(Math.abs(a.e0 - b.e0),
          Math.abs(a.kx - b.kx) * prepared.lengthScale, Math.abs(a.ky - b.ky) * prepared.lengthScale) /
          prepared.strainScale <= NEWTON_RESIDUAL_TOL
        // A rupture-clamped last station can already equal the first transition pivot. Skip that
        // collapsed parameter segment, preserving the same compatible states and material limit.
        if (sameState) definition = { ...definition, ratio: (1 + 2 * ratio) / 3 }
      }
    }
    const { point, admissibility } = evaluateState(beta, definition, coordinate)
    const boundaryQualified = definition.kind !== 'tension-pole-transition-ratio' || definition.ratio <= 1 / 3 || reachesSteelLimit(point.state)
    const residual = { P: point.P - (constantAxial ? target.P : multiplier * target.P),
      Mx: point.Mx - multiplier * target.Mx, My: point.My - multiplier * target.My }
    const scaled = [residual.P / forceScale, residual.Mx / momentScale, residual.My / momentScale]
    if (!scaled.every(Number.isFinite)) return null
    return { point, admissibility, boundaryQualified, residual, scaled, norm: Math.hypot(...scaled) }
  }
  let values = [Math.atan2(intersection.state.ky, intersection.state.kx),
    vertices.reduce((sum, point, index) => sum + weights[index] * (point.stationCoordinate ?? point.station), 0), 1]
  let current = evaluateAt(values)
  // A yielded axial plateau can admit many non-uniform states. Prefer the declared uniform pole
  // when its independently evaluated resultants lie on this ray; do not invent an axial beta.
  const targetNormSquared = multipliedTarget.reduce((sum, value) => sum + value * value, 0)
  for (const coordinate of constantAxial ? [] : [0, stations.length - 1]) {
    const pole = evaluateAt([0, coordinate, 1])
    if (!pole || targetNormSquared === 0) continue
    const multiplier = pole.scaled.reduce((sum, value, index) =>
      sum + (value + multipliedTarget[index]) * multipliedTarget[index], 0) / targetNormSquared
    const candidate = evaluateAt([0, coordinate, multiplier])
    if (candidate && candidate.norm <= NEWTON_RESIDUAL_TOL) {
      values = [0, coordinate, multiplier]; current = candidate; break
    }
  }
  // The final compatible path has yielded plateaus. Seed its finite interval with four bounded
  // probes, projecting the multiplier on the same ray, rather than starting on a zero tangent.
  if ((!current || current.norm > NEWTON_RESIDUAL_TOL) && values[1] > stations.length - 2) {
    const beta = values[0]
    for (const fraction of [0, 0.25, 0.5, 0.75]) {
      const coordinate = stations.length - 2 + fraction
      const seed = evaluateAt([beta, coordinate, 1])
      if (!seed || targetNormSquared === 0) continue
      const multiplier = seed.scaled.reduce((sum, value, index) =>
        sum + (value + multipliedTarget[index]) * multipliedTarget[index], 0) / targetNormSquared
      const candidate = evaluateAt([beta, coordinate, multiplier])
      if (candidate && (!current || candidate.norm < current.norm)) {
        values = [beta, coordinate, multiplier]; current = candidate
      }
    }
  }
  let iterations = 0
  for (; current && current.norm > NEWTON_RESIDUAL_TOL && iterations < NEWTON_MAX_ITERATIONS; iterations++) {
    const jacobian = Array.from({ length: 3 }, () => [0, 0, 0])
    let differentiable = true
    for (let column = 0; column < 2; column++) {
      const plus = [...values]; const minus = [...values]
      plus[column] += 1e-6; minus[column] -= 1e-6
      const forward = evaluateAt(plus); const backward = evaluateAt(minus)
      if (!forward && !backward) { differentiable = false; break }
      for (let row = 0; row < 3; row++) {
        jacobian[row][column] = ((forward ?? current).scaled[row] - (backward ?? current).scaled[row]) /
          (forward && backward ? 2e-6 : 1e-6)
      }
    }
    if (!differentiable) break
    for (let row = 0; row < 3; row++) jacobian[row][2] = -multipliedTarget[row]
    const delta = solve3(jacobian, current.scaled.map(value => -value))
    if (!delta) break
    const bound = Math.min(1, 0.25 / Math.max(Math.abs(delta[0]), Number.EPSILON),
      1 / Math.max(Math.abs(delta[1]), Number.EPSILON))
    let accepted = false
    for (let backtrack = 0; backtrack <= 12; backtrack++) {
      const step = bound * 2 ** -backtrack
      const candidateValues = values.map((value, index) => value + step * delta[index])
      const candidate = evaluateAt(candidateValues)
      if (candidate && candidate.norm < current.norm) {
        values = candidateValues; current = candidate; accepted = true; break
      }
    }
    if (!accepted) break
  }
  if (!current || current.norm > NEWTON_RESIDUAL_TOL) {
    return unavailable('non-converged', 'Physical capacity-field refinement did not converge; geometric checks remain available.', iterations)
  }
  const admissibility = current.admissibility
  if (!admissibility.ok) return unavailable('inadmissible', 'The refined capacity state leaves the material domain.', iterations)
  if (!current.boundaryQualified) return unavailable('non-converged', 'No physical material boundary could be qualified for this field.', iterations)
  const beforeCap = cap !== null && current.point.P > cap + forceScale * NEWTON_RESIDUAL_TOL
  return { status: 'available', boundary: beforeCap ? { kind: 'before-axial-cap', limit: cap } : { kind: 'design' },
    state: current.point.state, response: { P: current.point.P, Mx: current.point.Mx, My: current.point.My },
    loadFactor: values[2] * intersection.lambda, residual: current.residual, residualNorm: current.norm,
    iterations, admissibility, resistance: current.point.resistance ?? null,
    message: beforeCap
      ? 'Physical Design boundary before the axial cap on the same load ray; exceeds permitted Design resistance. Governing UR is unchanged.'
      : 'Compatible physical Design boundary state; governing surface UR is unchanged.' }
}

