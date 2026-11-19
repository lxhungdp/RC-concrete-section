import type {
  LoadDirectionCurve,
  LoadDirectionPoint,
  LoadDirectionUnresolvedStation,
  PreviewMomentPlanePath,
  PreviewSurface,
  PreviewSurfacePoint,
  Resultant,
  ResultantLedger,
  StationDefinition,
  SurfaceStation
} from './contracts'

/**
 * engineering/05 §3 (load-direction curve), root 05 §8: the physical cut of a capacity surface by the
 * vertical plane of the demand moment direction θ = atan2(Muy, Mux).
 *
 * The geometric plane cut of the triangulated surface fixes the topology and order of the curve. Each
 * crossing lies on a triangle edge between two physical states; the edge is parametrised by the
 * mechanics as a one-parameter family of compatible ultimate states (same station: β moves along the
 * ring; different stations: the station definition is interpolated as in adaptive refinement). Brent's
 * method then finds the state on that family whose moment points exactly along θ. A crossing whose
 * edge has no physical parametrisation, or whose root fails, keeps its geometric position, is labelled
 * `interpolated`, and is listed as unresolved.
 *
 * Mechanics-neutral: no constitutive law, resistance factor or station rule lives here.
 */

export type MomentComponents = { Mx: number; My: number }

/** A compatible state returned by a mechanics parametrisation (resultants plus state evidence). */
export type LoadDirectionState = Resultant & { beta: number } & Pick<LoadDirectionPoint, 'state' | 'ledger' | 'resistance' | 'equivalentBlock'>

/**
 * The mechanics' one-parameter family of physical states on the surface edge a→b, τ ∈ [0, 1], with
 * τ = 0 at a and τ = 1 at b; null when the edge has no physical parametrisation (synthetic faces,
 * poles of a mechanics without a pole state family). The family returns null for invalid arithmetic.
 */
export type LoadDirectionParametrisation = (
  a: PreviewSurfacePoint,
  b: PreviewSurfacePoint
) => ((tau: number) => LoadDirectionState | null) | null

/** Physical parametrisations of the Design and Nominal surface edges of one mechanics. */
export type LoadDirectionMechanics = {
  design: LoadDirectionParametrisation
  nominal: LoadDirectionParametrisation
}

/** Solver limits. The residual is the sine of the moment-direction error. */
export const LOAD_DIRECTION_LIMITS = {
  /** Accepted |sin(direction error)| of a physical point. */
  residualTolerance: 1e-9,
  /** Moment offsets below this fraction of the cut's largest moment count as on the plane. */
  absoluteMomentTolerance: 1e-12,
  /** Bracket width in τ at convergence. */
  tauTolerance: 1e-13,
  maxEvaluations: 60,
  /**
   * Geometric crossings with Mθ below −backHalfFraction × the cut's largest moment are on the back
   * half and are not projected. The margin keeps every crossing near the axis in the projection.
   */
  backHalfFraction: 1e-3
} as const

const TAU = 2 * Math.PI
const wrap = (angle: number) => ((angle % TAU) + TAU) % TAU

/** Signed sine and cosine of the angle between the moment and θ; null for a zero or non-finite moment. */
export const momentDirectionResidual = (moment: MomentComponents, theta: number) => {
  const magnitude = Math.hypot(moment.Mx, moment.My)
  if (!Number.isFinite(magnitude) || !Number.isFinite(theta) || magnitude === 0) return null
  const cos = Math.cos(theta), sin = Math.sin(theta)
  return {
    sine: (moment.My * cos - moment.Mx * sin) / magnitude,
    cosine: (moment.Mx * cos + moment.My * sin) / magnitude,
    projected: moment.Mx * cos + moment.My * sin
  }
}

/** Moment component along θ; positive on the forward half of the θ plane. */
export const momentAlongDirection = (point: MomentComponents, theta: number) =>
  point.Mx * Math.cos(theta) + point.My * Math.sin(theta)

/** Signed offset of the moment from the θ plane, My·cosθ − Mx·sinθ (continuous along an edge). */
const planeOffset = (point: MomentComponents, theta: number) => point.My * Math.cos(theta) - point.Mx * Math.sin(theta)

/** Shortest signed angular step from `from` to `to`. */
export const shortestAngleStep = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from))

type Unresolved = LoadDirectionUnresolvedStation['reason']
type RootResult =
  | { status: 'resolved'; tau: number; value: LoadDirectionState; evaluations: number }
  /** The bracket closed on a jump of the family; `value` is the side nearer the plane. */
  | { status: 'discontinuity'; tau: number; value: LoadDirectionState; evaluations: number }
  | { status: 'unresolved'; reason: Unresolved; evaluations: number }

/** Brent's method on τ for the plane offset of the parametrised family. */
const solveEdgeRoot = (
  family: (tau: number) => LoadDirectionState | null,
  theta: number,
  absoluteTolerance: number,
  limits: typeof LOAD_DIRECTION_LIMITS,
  /** A root of the same edge found by the other stage; accepted only if it passes the same test. */
  hint?: number
): RootResult => {
  let evaluations = 0
  const at = (tau: number) => {
    evaluations += 1
    const value = family(tau)
    if (!value || ![value.P, value.Mx, value.My, value.beta].every(Number.isFinite)) return null
    return { tau, value, f: planeOffset(value, theta) }
  }
  const converged = (sample: { value: LoadDirectionState; f: number }) => {
    const magnitude = Math.hypot(sample.value.Mx, sample.value.My)
    return Math.abs(sample.f) <= absoluteTolerance || Math.abs(sample.f) <= limits.residualTolerance * magnitude
  }
  if (hint !== undefined && hint >= 0 && hint <= 1) {
    const hinted = at(hint)
    if (hinted && converged(hinted)) return { status: 'resolved', tau: hint, value: hinted.value, evaluations }
  }
  let lower = at(0), upper = at(1)
  if (!lower || !upper) return { status: 'unresolved', reason: 'invalid-arithmetic', evaluations }
  if (converged(lower)) return { status: 'resolved', tau: 0, value: lower.value, evaluations }
  if (converged(upper)) return { status: 'resolved', tau: 1, value: upper.value, evaluations }
  if (lower.f * upper.f > 0) return { status: 'unresolved', reason: 'no-direction', evaluations }

  let a = lower, b = upper
  if (Math.abs(a.f) < Math.abs(b.f)) [a, b] = [b, a]
  let c = a, d = a.tau, bisected = true
  while (evaluations < limits.maxEvaluations) {
    if (converged(b)) return { status: 'resolved', tau: b.tau, value: b.value, evaluations }
    if (Math.abs(b.tau - a.tau) <= limits.tauTolerance) break
    let s = a.f !== c.f && b.f !== c.f
      ? a.tau * b.f * c.f / ((a.f - b.f) * (a.f - c.f)) +
        b.tau * a.f * c.f / ((b.f - a.f) * (b.f - c.f)) +
        c.tau * a.f * b.f / ((c.f - a.f) * (c.f - b.f))
      : b.tau - b.f * (b.tau - a.tau) / (b.f - a.f)
    const low = Math.min((3 * a.tau + b.tau) / 4, b.tau), high = Math.max((3 * a.tau + b.tau) / 4, b.tau)
    const bisect: boolean = !(s > low && s < high) ||
      (bisected && Math.abs(s - b.tau) >= Math.abs(b.tau - c.tau) / 2) ||
      (!bisected && Math.abs(s - b.tau) >= Math.abs(c.tau - d) / 2) ||
      (bisected && Math.abs(b.tau - c.tau) < limits.tauTolerance) ||
      (!bisected && Math.abs(c.tau - d) < limits.tauTolerance)
    if (bisect) s = (a.tau + b.tau) / 2
    bisected = bisect
    const next = at(s)
    if (!next) return { status: 'unresolved', reason: 'invalid-arithmetic', evaluations }
    d = c.tau; c = b
    if (a.f * next.f < 0) b = next
    else a = next
    if (Math.abs(a.f) < Math.abs(b.f)) [a, b] = [b, a]
  }
  if (converged(b)) return { status: 'resolved', tau: b.tau, value: b.value, evaluations }
  // A sign change that survives a closed bracket is a jump of the family, not a missed root.
  if (Math.abs(b.tau - a.tau) <= limits.tauTolerance && a.f * b.f < 0) {
    return { status: 'discontinuity', tau: b.tau, value: b.value, evaluations }
  }
  return { status: 'unresolved', reason: 'not-converged', evaluations }
}

const isPole = (point: PreviewSurfacePoint) => point.surfaceRole === 'pure-compression' || point.surfaceRole === 'pure-tension'

const stationLabel = (a: PreviewSurfacePoint, b: PreviewSurfacePoint) =>
  a.stationId === b.stationId ? `${a.stationId ?? 'face'}` : `${a.stationId ?? 'face'} – ${b.stationId ?? 'face'}`

/** Copy the state evidence of a returned state or stored surface point. */
const evidence = (value: Pick<LoadDirectionPoint, 'state' | 'ledger' | 'resistance' | 'equivalentBlock'>) => ({
  ...(value.state ? { state: value.state } : {}),
  ...(value.ledger ? { ledger: value.ledger } : {}),
  ...(value.resistance ? { resistance: value.resistance } : {}),
  ...(value.equivalentBlock ? { equivalentBlock: value.equivalentBlock } : {})
})

type StageInput = {
  paths: readonly PreviewMomentPlanePath[]
  parametrise: LoadDirectionParametrisation
}

type ProjectionContext = {
  theta: number
  stage: 'design' | 'nominal'
  absoluteTolerance: number
  limits: typeof LOAD_DIRECTION_LIMITS
  unresolved: LoadDirectionUnresolvedStation[]
  discontinuities: LoadDirectionCurve['discontinuities']
  residual: { max: number }
  evaluations: { count: number }
  /** Crossings with Mθ below this are on the back half and are dropped without projection. */
  backHalfLimit: number
  /** Edge roots of the stage solved first, offered to the other stage as a first trial. */
  edgeRoots: Map<string, number>
}

/** Identity of a surface edge by its two physical states (station and exact β). */
const edgeKey = (a: PreviewSurfacePoint, b: PreviewSurfacePoint) => `${a.stationId}@${a.beta}>${b.stationId}@${b.beta}`

/** Move one cut point onto the physical surface. */
const projectCutPoint = (
  point: PreviewMomentPlanePath['points'][number],
  parametrise: LoadDirectionParametrisation,
  context: ProjectionContext
): LoadDirectionPoint => {
  const { theta } = context
  const geometric = (role: LoadDirectionPoint['role']): LoadDirectionPoint => ({
    P: point.P, Mx: point.Mx, My: point.My, Mtheta: momentAlongDirection(point, theta), role, beta: null, stationId: null
  })
  const source = point.source
  if (!source) return geometric('interpolated')
  // Only Mθ ≥ 0 is kept. A crossing clearly behind the axis is never moved onto the surface; it
  // stays a geometric point that `forwardRuns` drops (or uses only to place the axis crossing).
  if (point.Mx * Math.cos(theta) + point.My * Math.sin(theta) < context.backHalfLimit) return geometric('interpolated')
  const vertex = source.a === source.b || source.t === 0 || source.t === 1
    ? (source.t === 1 ? source.b : source.a)
    : null
  if (vertex) {
    // A stored surface vertex on the plane is already a physical state with its own β.
    if (vertex.surfaceRole === 'pure-compression' || vertex.surfaceRole === 'pure-tension') {
      // A pole is a stored uniform-strain state: its evidence is kept, its β is undefined.
      return { ...geometric(vertex.surfaceRole), P: vertex.P, Mx: vertex.Mx, My: vertex.My,
        Mtheta: momentAlongDirection(vertex, theta), stationId: vertex.stationId, ...evidence(vertex) }
    }
    if (vertex.surfaceRole !== 'physical-state' || vertex.stationId === null) return geometric('interpolated')
    const residual = momentDirectionResidual(vertex, theta)?.sine ?? 0
    context.residual.max = Math.max(context.residual.max, Math.abs(residual))
    return {
      P: vertex.P, Mx: vertex.Mx, My: vertex.My, Mtheta: momentAlongDirection(vertex, theta),
      role: 'physical-station', beta: vertex.beta, stationId: vertex.stationId, directionResidual: residual,
      ...evidence(vertex)
    }
  }
  const { a, b } = source
  const family = parametrise(a, b)
  if (!family) {
    if (!isPole(a) && !isPole(b) && a.surfaceRole === 'physical-state' && b.surfaceRole === 'physical-state') {
      context.unresolved.push({ stage: context.stage, stationId: a.stationId === b.stationId ? a.stationId : null,
        label: stationLabel(a, b), reason: 'no-direction' })
    }
    return geometric('interpolated')
  }
  const key = edgeKey(a, b)
  const root = solveEdgeRoot(family, theta, context.absoluteTolerance, context.limits, context.edgeRoots.get(key))
  context.evaluations.count += root.evaluations
  if (root.status !== 'unresolved') {
    context.edgeRoots.set(key, root.tau)
    context.edgeRoots.set(edgeKey(b, a), 1 - root.tau)
  }
  if (root.status === 'unresolved') {
    context.unresolved.push({ stage: context.stage, stationId: a.stationId === b.stationId ? a.stationId : null,
      label: stationLabel(a, b), reason: root.reason })
    return geometric('interpolated')
  }
  const value = root.value
  const residual = momentDirectionResidual(value, theta)?.sine ?? 0
  context.residual.max = Math.max(context.residual.max, Math.abs(residual))
  if (root.status === 'discontinuity') {
    context.discontinuities.push({ stage: context.stage, label: stationLabel(a, b), directionResidual: residual })
  }
  const base = {
    P: value.P, Mx: value.Mx, My: value.My, Mtheta: momentAlongDirection(value, theta),
    beta: wrap(value.beta), directionResidual: residual, ...evidence(value)
  }
  if (a.stationId !== null && a.stationId === b.stationId) {
    return { ...base, role: 'physical-station', stationId: a.stationId }
  }
  if (root.tau === 0 && a.stationId !== null && !isPole(a)) return { ...base, role: 'physical-station', stationId: a.stationId }
  if (root.tau === 1 && b.stationId !== null && !isPole(b)) return { ...base, role: 'physical-station', stationId: b.stationId }
  return {
    ...base,
    role: 'between-stations',
    stationId: null,
    ...(a.stationId !== null && b.stationId !== null
      ? { between: { from: a.stationId, to: b.stationId, fraction: root.tau } }
      : {})
  }
}

const samePosition = (left: Resultant, right: Resultant, forceTol: number, momentTol: number) =>
  Math.abs(left.P - right.P) <= forceTol && Math.abs(left.Mx - right.Mx) <= momentTol && Math.abs(left.My - right.My) <= momentTol

/** Geometric point where a path segment crosses Mθ = 0. */
const axisCrossing = (left: LoadDirectionPoint, right: LoadDirectionPoint, theta: number): LoadDirectionPoint => {
  const ratio = left.Mtheta / (left.Mtheta - right.Mtheta)
  const P = left.P + ratio * (right.P - left.P)
  const Mx = left.Mx + ratio * (right.Mx - left.Mx)
  const My = left.My + ratio * (right.My - left.My)
  if (![ratio, P, Mx, My].every(Number.isFinite)) throw new RangeError('Non-finite axis crossing on the load-direction curve.')
  return { P, Mx, My, Mtheta: momentAlongDirection({ Mx, My }, theta), role: 'axis', beta: null, stationId: null }
}

/**
 * Keep the forward half (Mθ ≥ 0) of a projected cut path, oriented from compression to tension. A
 * closed loop is rotated so that one forward run is not split at the arbitrary loop start.
 */
const forwardRuns = (path: LoadDirectionPoint[], closed: boolean, theta: number, tolerance: number) => {
  if (path.length === 0) return []
  const forward = (point: LoadDirectionPoint) => point.Mtheta >= -tolerance
  let points = path
  if (closed) {
    const open = points.length > 1 && points[0] === points[points.length - 1] ? points.slice(0, -1) : points.slice()
    const back = open.findIndex((point) => !forward(point))
    if (back < 0) points = [...open, open[0]]
    else points = [...open.slice(back), ...open.slice(0, back), open[back]]
  }
  const runs: LoadDirectionPoint[][] = []
  let current: LoadDirectionPoint[] = []
  for (let index = 0; index < points.length; index++) {
    const point = points[index]
    const previous = index > 0 ? points[index - 1] : null
    if (previous && forward(previous) !== forward(point)) {
      // A forward point already on the axis (a pole of a symmetric cut) is its own boundary.
      const onAxis = Math.abs(forward(point) ? point.Mtheta : previous.Mtheta) <= tolerance
      const crossing = onAxis ? null : axisCrossing(previous, point, theta)
      if (forward(point)) current = crossing ? [crossing] : []
      else {
        if (crossing) current.push(crossing)
        if (current.length > 1) runs.push(current)
        current = []
      }
    }
    if (forward(point)) current.push(point)
  }
  if (current.length > 1) runs.push(current)
  return runs.map((run) => run[0].P >= run[run.length - 1].P ? run : [...run].reverse())
}

const capCrossing = (a: LoadDirectionPoint, b: LoadDirectionPoint, cap: number, theta: number): LoadDirectionPoint => {
  // The same affine edge/plane intersection the surface cap uses (root 05 §9); geometric only.
  const ratio = (cap - a.P) / (b.P - a.P)
  const Mx = a.Mx + ratio * (b.Mx - a.Mx)
  const My = a.My + ratio * (b.My - a.My)
  if (![ratio, Mx, My].every(Number.isFinite)) throw new RangeError('Non-finite axial-cap crossing on the load-direction curve.')
  return { P: cap, Mx, My, Mtheta: momentAlongDirection({ Mx, My }, theta), role: 'cap-edge', beta: null, stationId: null }
}

/** Split a path at P = cap into the retained part (P ≤ cap) and the excluded part above it. */
const clipAtCap = (path: readonly LoadDirectionPoint[], cap: number, theta: number) => {
  const below: LoadDirectionPoint[][] = []
  const above: LoadDirectionPoint[][] = []
  let current: LoadDirectionPoint[] = []
  let currentAbove: LoadDirectionPoint[] = []
  const axis: LoadDirectionPoint = { P: cap, Mx: 0, My: 0, Mtheta: 0, role: 'axial-center', beta: null, stationId: null }
  for (let index = 0; index < path.length; index++) {
    const point = path[index]
    const previous = index > 0 ? path[index - 1] : null
    const pointAbove = point.P > cap
    if (previous && (previous.P > cap) !== pointAbove) {
      const crossing = capCrossing(previous, point, cap, theta)
      if (pointAbove) {
        current.push(crossing)
        if (current.length > 1) below.push(current)
        current = []
        currentAbove = [crossing]
      } else {
        currentAbove.push(crossing)
        if (currentAbove.length > 1) above.push(currentAbove)
        currentAbove = []
        // The retained boundary runs along the cap face from the axis to this crossing.
        current = [axis, crossing]
      }
    }
    if (pointAbove) currentAbove.push(point)
    else current.push(point)
  }
  if (current.length > 1) below.push(current)
  if (currentAbove.length > 1) above.push(currentAbove)
  return { below, above }
}

/**
 * Build the load-direction curve from the geometric θ-plane cuts of the pre-cap Design and the
 * Nominal datasets. `cap` is the maximum axial resistance when the Design surface has one.
 */
export const projectLoadDirectionCut = (input: {
  theta: number
  design: StageInput
  nominal: StageInput
  cap: number | null
  limits?: Partial<typeof LOAD_DIRECTION_LIMITS>
}): LoadDirectionCurve => {
  const { theta } = input
  if (!Number.isFinite(theta)) throw new RangeError('The load direction θ must be finite.')
  if (input.cap !== null && !Number.isFinite(input.cap)) throw new RangeError('An axial-cap limit must be finite.')
  const limits = { ...LOAD_DIRECTION_LIMITS, ...input.limits }
  const unresolved: LoadDirectionUnresolvedStation[] = []
  const discontinuities: LoadDirectionCurve['discontinuities'] = []
  const residual = { max: 0 }
  const evaluations = { count: 0 }
  // Design is solved first; on an edge both stages share (same stations and β), its root is the
  // Nominal stage's first trial. With a global resultant factor the two directions coincide.
  const edgeRoots = new Map<string, number>()

  const stagePaths = (stage: 'design' | 'nominal', source: StageInput) => {
    const all = source.paths.flatMap((path) => path.points)
    const momentScale = Math.max(1, ...all.map((point) => Math.hypot(point.Mx, point.My)))
    const forceScale = Math.max(1, ...all.map((point) => Math.abs(point.P)))
    const context: ProjectionContext = {
      theta, stage, absoluteTolerance: momentScale * limits.absoluteMomentTolerance, limits, unresolved, discontinuities, residual, evaluations,
      backHalfLimit: -limits.backHalfFraction * momentScale, edgeRoots
    }
    const momentTol = momentScale * 1e-9, forceTol = forceScale * 1e-9
    return source.paths.flatMap((path) => {
      const projected: LoadDirectionPoint[] = []
      for (const point of path.points) {
        const next = projectCutPoint(point, source.parametrise, context)
        const last = projected[projected.length - 1]
        if (last && samePosition(last, next, forceTol, momentTol)) continue
        projected.push(next)
      }
      // A closed loop repeats its start; keep that identity for `forwardRuns`.
      if (path.closed && projected.length > 1 && samePosition(projected[0], projected[projected.length - 1], forceTol, momentTol)) {
        projected[projected.length - 1] = projected[0]
      }
      return forwardRuns(projected, path.closed, theta, context.absoluteTolerance)
    })
  }

  const rawDesign = stagePaths('design', input.design)
  const nominalPaths = stagePaths('nominal', input.nominal)
  let designPaths = rawDesign
  const beforeAxialCapPaths: LoadDirectionPoint[][] = []
  if (input.cap !== null) {
    designPaths = []
    for (const path of rawDesign) {
      const clipped = clipAtCap(path, input.cap, theta)
      designPaths.push(...clipped.below)
      beforeAxialCapPaths.push(...clipped.above)
    }
  }
  return {
    theta,
    designPaths,
    nominalPaths,
    beforeAxialCapPaths,
    unresolved,
    discontinuities,
    maxDirectionResidual: residual.max,
    evaluations: evaluations.count
  }
}

/** Short-way β interpolation along an edge, wrapped to [0, 2π). */
export const edgeBeta = (a: Pick<PreviewSurfacePoint, 'beta'>, b: Pick<PreviewSurfacePoint, 'beta'>, tau: number) =>
  wrap(a.beta + tau * shortestAngleStep(a.beta, b.beta))

/** One load-direction point as a surface point, with the station definition that reproduces it. */
export type LoadDirectionSurfaceEntry = {
  point: PreviewSurfacePoint
  /** Station of a ring point; a generated between-stations descriptor; null for geometric points. */
  station: SurfaceStation | null
  criterion: string
  /** Strain-gradient direction of the state, radians; null where the state has no direction. */
  beta: number | null
  source: LoadDirectionPoint
}

const totalOnlyLedger = (value: Resultant): ResultantLedger => {
  const zero = { P: 0, Mx: 0, My: 0 }
  return { concrete: zero, steelGross: zero, displacedConcrete: zero, steel: zero, total: { P: value.P, Mx: value.Mx, My: value.My } }
}

const GEOMETRIC_CRITERIA: Partial<Record<LoadDirectionPoint['role'], string>> = {
  'cap-edge': 'Pmax intersection',
  'axial-center': 'Axial center',
  axis: 'Zero-moment crossing',
  interpolated: 'Geometric cut (no physical state)'
}

/**
 * engineering/05 §3: the points of one stage of a load-direction curve, in curve order, as surface
 * points that the chart tables, the calculation inspector and the formula audits already read. Each
 * physical point keeps its own β and state. A between-stations point gets the station definition
 * that reproduces it (the adaptive interpolation of its two stations at its fraction for stress–strain;
 * a labelled adaptive block station for the equivalent block). Geometric points carry no strain state
 * and are marked as synthetic faces, so audits anchor them to their geometry and never invent a field.
 */
export const loadDirectionSurfacePoints = (
  curve: LoadDirectionCurve,
  stage: 'design' | 'nominal',
  stations: readonly SurfaceStation[],
  mechanics: PreviewSurface['mechanics']
): LoadDirectionSurfaceEntry[] => {
  const byId = new Map(stations.map((station) => [station.id, station] as const))
  const paths = stage === 'design' ? curve.designPaths : curve.nominalPaths
  const entries: LoadDirectionSurfaceEntry[] = []
  for (const point of paths.flat()) {
    const index = entries.length
    const physical = (point.role === 'physical-station' || point.role === 'between-stations') && point.state !== undefined
    const pole = point.role === 'pure-compression' || point.role === 'pure-tension'
    let station: SurfaceStation | null = point.stationId ? byId.get(point.stationId) ?? null : null
    let criterion = GEOMETRIC_CRITERIA[point.role] ?? station?.label ?? point.stationId ?? '—'
    if (point.role === 'between-stations' && point.between) {
      const from = byId.get(point.between.from), to = byId.get(point.between.to)
      const fraction = point.between.fraction
      const label = `between ${from?.label ?? point.between.from} and ${to?.label ?? point.between.to} (${(100 * fraction).toFixed(1)} %)`
      const definition: StationDefinition = mechanics === 'equivalent-rectangular-block' || !from || !to
        ? { kind: 'block-adaptive', label }
        : { kind: 'adaptive-state-interpolation', left: from.definition, right: to.definition, ratio: fraction }
      station = { id: `adaptive-station-between-${point.between.from}-${point.between.to}-${fraction}`, label, definition, fixed: false }
      criterion = label
    }
    entries.push({
      point: {
        id: `load-direction-${stage}-${index}`,
        beta: point.beta ?? curve.theta,
        station: index,
        stationId: physical || pole ? point.stationId : null,
        surfaceRole: physical ? 'physical-state' : pole ? point.role as 'pure-compression' | 'pure-tension' : 'axial-cap',
        onSampledDirection: false,
        state: point.state ?? { e0: 0, kx: 0, ky: 0 },
        ledger: point.ledger ?? totalOnlyLedger(point),
        P: point.P, Mx: point.Mx, My: point.My,
        ...(point.resistance ? { resistance: point.resistance } : {}),
        ...(point.equivalentBlock ? { equivalentBlock: point.equivalentBlock } : {})
      },
      station: physical || pole ? station : null,
      criterion,
      beta: physical ? point.beta : null,
      source: point
    })
  }
  return entries
}
