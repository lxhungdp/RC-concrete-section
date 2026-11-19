/**
 * Independent oracle for the biaxial P-M audit.
 *
 * Record: docs/task-packets/2026-11-11-biaxial-pm-audit.md.
 *
 * This module deliberately imports no production geometry, material, mechanics or design-code
 * package. Every quantity is re-derived here from the declared inputs:
 *
 * - exact section properties by the shoelace formulas;
 * - concrete resultants by exact strip integration: a strain plane is constant on every line
 *   `g . p = s`, so each resultant is a one-dimensional integral over `s` of the stress times the
 *   chord length `w(s)` and the chord first moment `m(s)`. Between vertex projections and material
 *   breakpoints `w` is linear and `m` quadratic, so three-point Gauss-Legendre is exact for the
 *   quadratic KDS parabola and for a constant block stress;
 * - reinforcement as point areas with the displaced concrete removed;
 * - the KDS 14 20 10 and ACI 318-19(22) strength-reduction rules exactly as written in
 *   docs/11-design-standards-and-resistance-formats.md sections 6.1 and 8;
 * - a dense Design surface (pole fans plus a rows-by-depth grid), the code axial cap, and its own
 *   bounding-volume ray intersection.
 *
 * Units are N, mm, MPa and N.mm. Compression strain, stress and P are positive. Moments follow the
 * project convention Mx = sum F (y - y0), My = sum F (x - x0) about the net-concrete centroid.
 */

export type Point = { readonly x: number; readonly y: number }
export type OracleBar = Point & { readonly area: number }
export type OracleSection = {
  readonly outers: readonly (readonly Point[])[]
  readonly holes: readonly (readonly Point[])[]
  readonly bars: readonly OracleBar[]
}
export type Resultant = { P: number; Mx: number; My: number }

/** Declared parabola-rectangle law, n = 2 (KDS 14 20 20 Table 4.1-2 first row, fck <= 40 MPa). */
export type ParabolicConcreteLaw = {
  readonly kind: 'parabolic'
  readonly fck: number
  readonly alpha: number
  readonly epsC0: number
  readonly epsCu: number
}

/** Uniform block stress over depth `a = beta1 c`; extreme fibre strain `epsCu`. */
export type BlockConcreteLaw = {
  readonly kind: 'block'
  readonly stress: number
  readonly beta1: number
  readonly epsCu: number
}

export type PlateauSteelLaw = { readonly fy: number; readonly Es: number }

export type StrengthReductionRule =
  | {
      readonly kind: 'kds-fixed-or-yield-multiple'
      readonly phiCompression: number
      readonly phiTension: number
      readonly yieldStressThreshold: number
      readonly fixedLimit: number
      readonly yieldMultiple: number
    }
  | {
      readonly kind: 'aci-yield-plus'
      readonly phiCompression: number
      readonly phiTension: number
      readonly extraStrain: number
    }

export type OracleMechanics = {
  readonly concrete: ParabolicConcreteLaw | BlockConcreteLaw
  readonly steel: PlateauSteelLaw
  readonly phi: StrengthReductionRule
  /** Maximum design axial compression as a fraction of the factored concentric pole. */
  readonly axialCapRatio: number
  /** Uniform tensile strain of the pure-tension pole as a multiple of the yield strain. */
  readonly tensionPoleYieldMultiple: number
}

const GAUSS_NODES = [-Math.sqrt(3 / 5), 0, Math.sqrt(3 / 5)] as const
const GAUSS_WEIGHTS = [5 / 9, 8 / 9, 5 / 9] as const

const ringSigned = (ring: readonly Point[]) => {
  let twiceArea = 0
  let qx6 = 0
  let qy6 = 0
  for (let index = 0; index < ring.length; index += 1) {
    const a = ring[index]
    const b = ring[(index + 1) % ring.length]
    const cross = a.x * b.y - b.x * a.y
    twiceArea += cross
    qx6 += (a.x + b.x) * cross
    qy6 += (a.y + b.y) * cross
  }
  const sign = twiceArea < 0 ? -1 : 1
  return { area: sign * twiceArea / 2, qx: sign * qx6 / 6, qy: sign * qy6 / 6 }
}

/** Net area and centroid; holes are subtracted whatever their orientation. */
export const sectionProperties = (section: OracleSection) => {
  let area = 0
  let qx = 0
  let qy = 0
  for (const ring of section.outers) {
    const value = ringSigned(ring)
    area += value.area
    qx += value.qx
    qy += value.qy
  }
  for (const ring of section.holes) {
    const value = ringSigned(ring)
    area -= value.area
    qx -= value.qx
    qy -= value.qy
  }
  if (!(area > 0)) throw new Error('Oracle section must have a positive net area.')
  return { area, centroid: { x: qx / area, y: qy / area } }
}

type Direction = { gx: number; gy: number }

const projectionRange = (section: OracleSection, { gx, gy }: Direction) => {
  let minimum = Number.POSITIVE_INFINITY
  let maximum = Number.NEGATIVE_INFINITY
  for (const ring of section.outers) {
    for (const point of ring) {
      const value = gx * point.x + gy * point.y
      if (value < minimum) minimum = value
      if (value > maximum) maximum = value
    }
  }
  return { minimum, maximum }
}

/** Length and first moment (along g-perpendicular) of the section chord on the line g.p = s. */
const chord = (section: OracleSection, { gx, gy }: Direction, s: number) => {
  const crossings: number[] = []
  const visit = (ring: readonly Point[]) => {
    for (let index = 0; index < ring.length; index += 1) {
      const a = ring[index]
      const b = ring[(index + 1) % ring.length]
      const da = gx * a.x + gy * a.y - s
      const db = gx * b.x + gy * b.y - s
      if ((da > 0) === (db > 0)) continue
      const fraction = da / (da - db)
      const ta = -gy * a.x + gx * a.y
      const tb = -gy * b.x + gx * b.y
      crossings.push(ta + fraction * (tb - ta))
    }
  }
  section.outers.forEach(visit)
  section.holes.forEach(visit)
  crossings.sort((left, right) => left - right)
  if (crossings.length % 2 !== 0) throw new Error('Oracle chord has an odd number of boundary crossings.')
  let width = 0
  let moment = 0
  for (let index = 0; index < crossings.length; index += 2) {
    const t0 = crossings[index]
    const t1 = crossings[index + 1]
    width += t1 - t0
    moment += (t1 * t1 - t0 * t0) / 2
  }
  return { width, moment }
}

/**
 * Exact integral of a stress field that depends on s = g.p only. `stress` must be a polynomial of
 * degree <= 2 between consecutive entries of `breakpoints`. Returns P and the first moments about
 * the global origin, Sx = int sigma x dA and Sy = int sigma y dA.
 */
const integrateConcrete = (
  section: OracleSection,
  direction: Direction,
  stress: (s: number) => number,
  breakpoints: readonly number[]
) => {
  const { gx, gy } = direction
  const levels = new Set<number>()
  for (const ring of [...section.outers, ...section.holes]) {
    for (const point of ring) levels.add(gx * point.x + gy * point.y)
  }
  const { minimum, maximum } = projectionRange(section, direction)
  for (const value of breakpoints) if (value > minimum && value < maximum) levels.add(value)
  const sorted = [...levels].sort((left, right) => left - right)
  let P = 0
  let Sx = 0
  let Sy = 0
  for (let index = 0; index + 1 < sorted.length; index += 1) {
    const low = sorted[index]
    const high = sorted[index + 1]
    if (!(high > low)) continue
    const half = (high - low) / 2
    const middle = (high + low) / 2
    for (let node = 0; node < 3; node += 1) {
      const s = middle + half * GAUSS_NODES[node]
      const sigma = stress(s)
      if (sigma === 0) continue
      const { width, moment } = chord(section, direction, s)
      const factor = sigma * GAUSS_WEIGHTS[node] * half
      P += factor * width
      Sx += factor * (s * gx * width - gy * moment)
      Sy += factor * (s * gy * width + gx * moment)
    }
  }
  return { P, Sx, Sy }
}

const parabolicStress = (law: ParabolicConcreteLaw, strain: number) => {
  if (!(strain > 0) || strain > law.epsCu * (1 + 1e-12)) return 0
  const peak = law.alpha * law.fck
  if (strain >= law.epsC0) return peak
  const remainder = 1 - strain / law.epsC0
  return peak * (1 - remainder * remainder)
}

const steelStress = (law: PlateauSteelLaw, strain: number) =>
  Math.max(-law.fy, Math.min(law.fy, law.Es * strain))

/** One compatible state: compression edge at the concrete ultimate strain, neutral-axis depth c. */
export type OracleState = { readonly theta: number; readonly depth: number }

export type OracleEvaluation = {
  nominal: Resultant
  controllingTensileStrain: number
}

export type PreparedOracle = {
  section: OracleSection
  mechanics: OracleMechanics
  area: number
  centroid: Point
  steelArea: number
}

export const prepareOracle = (section: OracleSection, mechanics: OracleMechanics): PreparedOracle => {
  const { area, centroid } = sectionProperties(section)
  const steelArea = section.bars.reduce((sum, bar) => sum + bar.area, 0)
  return { section, mechanics, area, centroid, steelArea }
}

const aboutCentroid = (prepared: PreparedOracle, P: number, Sx: number, Sy: number): Resultant => ({
  P,
  Mx: Sy - prepared.centroid.y * P,
  My: Sx - prepared.centroid.x * P
})

/**
 * Nominal resultant of the state whose strain-gradient (compression-increasing) direction is
 * g = (cos theta, sin theta) and whose neutral axis lies `depth` below the compression edge.
 */
export const evaluateState = (prepared: PreparedOracle, state: OracleState): OracleEvaluation => {
  const { section, mechanics } = prepared
  const direction = { gx: Math.cos(state.theta), gy: Math.sin(state.theta) }
  const { maximum } = projectionRange(section, direction)
  const law = mechanics.concrete
  const epsCu = law.epsCu
  const c = state.depth
  const strainAt = (s: number) => epsCu * (1 - (maximum - s) / c)
  let concrete: { P: number; Sx: number; Sy: number }
  if (law.kind === 'parabolic') {
    concrete = integrateConcrete(
      section,
      direction,
      (s) => parabolicStress(law, strainAt(s)),
      [maximum - c, maximum - c * (1 - law.epsC0 / epsCu)]
    )
  } else {
    const blockDepth = law.beta1 * c
    concrete = integrateConcrete(
      section,
      direction,
      (s) => (maximum - s <= blockDepth ? law.stress : 0),
      [maximum - blockDepth]
    )
  }
  let P = concrete.P
  let Sx = concrete.Sx
  let Sy = concrete.Sy
  let controllingTensileStrain = 0
  for (const bar of section.bars) {
    const s = direction.gx * bar.x + direction.gy * bar.y
    const strain = strainAt(s)
    controllingTensileStrain = Math.max(controllingTensileStrain, -strain)
    const displaced = law.kind === 'parabolic'
      ? parabolicStress(law, strain)
      : (maximum - s <= law.beta1 * c ? law.stress : 0)
    const force = (steelStress(mechanics.steel, strain) - displaced) * bar.area
    P += force
    Sx += force * bar.x
    Sy += force * bar.y
  }
  return { nominal: aboutCentroid(prepared, P, Sx, Sy), controllingTensileStrain }
}

/** Uniform-strain pole; `strain` is applied to every concrete point and bar. */
export const evaluateUniform = (prepared: PreparedOracle, strain: number): Resultant => {
  const { section, mechanics } = prepared
  const law = mechanics.concrete
  const concreteStress = law.kind === 'parabolic'
    ? parabolicStress(law, strain)
    : (strain > 0 ? law.stress : 0)
  let P = concreteStress * prepared.area
  let Sx = P * prepared.centroid.x
  let Sy = P * prepared.centroid.y
  for (const bar of section.bars) {
    const force = (steelStress(mechanics.steel, strain) - concreteStress) * bar.area
    P += force
    Sx += force * bar.x
    Sy += force * bar.y
  }
  return aboutCentroid(prepared, P, Sx, Sy)
}

export const strengthReduction = (rule: StrengthReductionRule, steel: PlateauSteelLaw, tensileStrain: number) => {
  const yieldStrain = steel.fy / steel.Es
  const limit = rule.kind === 'aci-yield-plus'
    ? yieldStrain + rule.extraStrain
    : steel.fy <= rule.yieldStressThreshold ? rule.fixedLimit : rule.yieldMultiple * yieldStrain
  if (tensileStrain <= yieldStrain) return rule.phiCompression
  if (tensileStrain >= limit) return rule.phiTension
  return rule.phiCompression + (rule.phiTension - rule.phiCompression) * (tensileStrain - yieldStrain) / (limit - yieldStrain)
}

const scale = (value: Resultant, factor: number): Resultant =>
  ({ P: value.P * factor, Mx: value.Mx * factor, My: value.My * factor })

export const designState = (prepared: PreparedOracle, state: OracleState): Resultant => {
  const evaluation = evaluateState(prepared, state)
  return scale(evaluation.nominal, strengthReduction(prepared.mechanics.phi, prepared.mechanics.steel, evaluation.controllingTensileStrain))
}

/**
 * c/D values from far outside the section to a very shallow compression zone: geometric from 50 to
 * 1.5, uniform from 1.5 to 1 (a stress block still ends inside the section there), and uniform
 * from 1 to 0.005.
 */
export const oracleDepthRatios = (outside = 40, near = 80, inside = 400) => {
  const ratios: number[] = []
  for (let index = 0; index < outside; index += 1) ratios.push(1.5 * (50 / 1.5) ** (1 - index / outside))
  for (let index = 0; index < near; index += 1) ratios.push(1.5 - (index / near) * 0.5)
  for (let index = 0; index <= inside; index += 1) ratios.push(1 - (index / inside) * 0.995)
  return ratios
}

export type OracleSurfaceOptions = {
  /** Uniform starting rows over the full circle of gradient directions. */
  readonly baseDirections: number
  /**
   * Interval bisection threshold: the true midpoint row may deviate from the chord of its two
   * neighbours by at most `tolerance` in every component, each normalised by its own maximum over
   * the surface (P by max|P|, Mx by max|Mx|, My by max|My|). Per-axis scales keep a weak-axis
   * error visible on an elongated section.
   */
  readonly tolerance: number
  readonly maxBisections: number
  /** Hard resource limit on the refined ring; exceeding it is an error, never a silent stop. */
  readonly maxRows: number
  readonly depthRatios: readonly number[]
}

/** Reference resolution used for every gated comparison. */
export const DEFAULT_ORACLE_OPTIONS: OracleSurfaceOptions = {
  baseDirections: 720,
  tolerance: 5e-4,
  maxBisections: 6,
  maxRows: 12000,
  depthRatios: oracleDepthRatios(60, 120, 600)
}

/**
 * Half resolution in every coordinate. Its difference from the reference over-estimates the
 * reference error whenever the oracle converges monotonically, so it is used as that error.
 */
export const CHECK_ORACLE_OPTIONS: OracleSurfaceOptions = {
  baseDirections: 360,
  tolerance: 1e-3,
  maxBisections: 6,
  maxRows: 12000,
  depthRatios: oracleDepthRatios(40, 80, 400)
}

export type OracleRow = {
  theta: number
  /** Distance from the compression edge to the deepest bar along this gradient direction. */
  controllingBarDepth: number
  projectedDepth: number
  depths: number[]
  points: Resultant[]
  /**
   * Which bars lie inside the stress block at each state (block law only; 0 for the fibre law).
   * A bar entering the block subtracts its displaced concrete as a step, so chord errors across a
   * changed signature measure that step, not an angular sampling error.
   */
  blockSignatures: Int32Array
}

export type OracleSurface = {
  vertices: Resultant[]
  /** Neutral-axis depth of each vertex in mm; NaN for the two uniform poles. */
  vertexDepth: Float64Array
  /** Row index of each vertex; -1 for the poles. */
  vertexRow: Int32Array
  rows: OracleRow[]
  triangles: Int32Array
  axialCap: number
  compressionPole: Resultant
  tensionPole: Resultant
}

const directionRow = (prepared: PreparedOracle, theta: number, ratios: readonly number[]): OracleRow => {
  const gx = Math.cos(theta)
  const gy = Math.sin(theta)
  const { minimum, maximum } = projectionRange(prepared.section, { gx, gy })
  let deepestBar = Number.POSITIVE_INFINITY
  for (const bar of prepared.section.bars) deepestBar = Math.min(deepestBar, gx * bar.x + gy * bar.y)
  const projectedDepth = maximum - minimum
  const depths = ratios.map((ratio) => ratio * projectedDepth)
  const law = prepared.mechanics.concrete
  const blockSignatures = new Int32Array(depths.length)
  if (law.kind === 'block') {
    depths.forEach((depth, column) => {
      let hash = 0x811c9dc5 | 0
      prepared.section.bars.forEach((bar, index) => {
        if (maximum - (gx * bar.x + gy * bar.y) <= law.beta1 * depth) hash = Math.imul(hash ^ (index + 1), 0x01000193)
      })
      blockSignatures[column] = hash
    })
  }
  return {
    theta,
    controllingBarDepth: maximum - deepestBar,
    projectedDepth,
    depths,
    points: depths.map((depth) => designState(prepared, { theta, depth })),
    blockSignatures
  }
}

/** Dense Design surface: pole fans, an adaptively bisected ring of rows, then the axial cap. */
export const buildOracleDesignSurface = (
  prepared: PreparedOracle,
  options: OracleSurfaceOptions = DEFAULT_ORACLE_OPTIONS
): OracleSurface => {
  const { mechanics } = prepared
  // The block concentric reference uses fy for reinforcement (P0 = 0.85 f'c (Ag - Ast) + fy Ast);
  // the fibre pole is the uniform ultimate-strain state itself.
  const compressionStrain = mechanics.concrete.kind === 'block'
    ? Math.max(mechanics.concrete.epsCu, 2 * mechanics.steel.fy / mechanics.steel.Es)
    : mechanics.concrete.epsCu
  const compressionPole = scale(evaluateUniform(prepared, compressionStrain), mechanics.phi.phiCompression)
  const tensionStrain = -mechanics.tensionPoleYieldMultiple * mechanics.steel.fy / mechanics.steel.Es
  const tensionPole = scale(evaluateUniform(prepared, tensionStrain), mechanics.phi.phiTension)

  const base = Array.from({ length: options.baseDirections }, (_, index) =>
    directionRow(prepared, (2 * Math.PI * index) / options.baseDirections, options.depthRatios))
  const scales = { P: 1, Mx: 1, My: 1 }
  for (const row of base) {
    for (const point of row.points) {
      scales.P = Math.max(scales.P, Math.abs(point.P))
      scales.Mx = Math.max(scales.Mx, Math.abs(point.Mx))
      scales.My = Math.max(scales.My, Math.abs(point.My))
    }
  }
  const chordError = (left: OracleRow, middle: OracleRow, right: OracleRow) => {
    let error = 0
    for (let column = 0; column < middle.points.length; column += 1) {
      const signature = middle.blockSignatures[column]
      if (left.blockSignatures[column] !== signature || right.blockSignatures[column] !== signature) continue
      const a = left.points[column]
      const b = right.points[column]
      const m = middle.points[column]
      error = Math.max(error,
        Math.abs(m.P - (a.P + b.P) / 2) / scales.P,
        Math.abs(m.Mx - (a.Mx + b.Mx) / 2) / scales.Mx,
        Math.abs(m.My - (a.My + b.My) / 2) / scales.My)
    }
    return error
  }
  const rows: OracleRow[] = []
  /**
   * Adaptive-quadrature safeguard: an interval whose bisection error does not fall below 3/4 of its
   * parent's is dominated by a step (for example a bar entering the stress block), which no
   * angular refinement removes. Smooth intervals and kinks keep converging and are refined.
   */
  let evaluatedRows = base.length
  const refine = (left: OracleRow, right: OracleRow, rightTheta: number, level: number, parentError: number) => {
    if (level >= options.maxBisections) return
    const middle = directionRow(prepared, (left.theta + rightTheta) / 2, options.depthRatios)
    evaluatedRows += 1
    if (evaluatedRows > options.maxRows) throw new Error(`Oracle direction refinement exceeded ${options.maxRows} rows.`)
    const error = chordError(left, middle, right)
    if (error <= options.tolerance || error > 0.75 * parentError) return
    refine(left, middle, middle.theta, level + 1, error)
    rows.push(middle)
    refine(middle, right, rightTheta, level + 1, error)
  }
  for (let index = 0; index < base.length; index += 1) {
    const left = base[index]
    const right = base[(index + 1) % base.length]
    const rightTheta = index + 1 === base.length ? right.theta + 2 * Math.PI : right.theta
    rows.push(left)
    refine(left, right, rightTheta, 0, Number.POSITIVE_INFINITY)
  }

  const columns = options.depthRatios.length
  const vertices: Resultant[] = [tensionPole, compressionPole]
  const vertexDepth: number[] = [Number.NaN, Number.NaN]
  const vertexRow: number[] = [-1, -1]
  rows.forEach((row, rowIndex) => {
    row.points.forEach((point, column) => {
      vertices.push(point)
      vertexDepth.push(row.depths[column])
      vertexRow.push(rowIndex)
    })
  })
  const index = (row: number, column: number) => 2 + (row % rows.length) * columns + column
  const triangles = new Int32Array(rows.length * (2 * (columns - 1) + 2) * 3)
  let cursor = 0
  const push = (a: number, b: number, c: number) => {
    triangles[cursor++] = a
    triangles[cursor++] = b
    triangles[cursor++] = c
  }
  for (let row = 0; row < rows.length; row += 1) {
    push(1, index(row, 0), index(row + 1, 0))
    for (let column = 0; column + 1 < columns; column += 1) {
      push(index(row, column), index(row, column + 1), index(row + 1, column))
      push(index(row + 1, column), index(row, column + 1), index(row + 1, column + 1))
    }
    push(0, index(row + 1, columns - 1), index(row, columns - 1))
  }
  return {
    vertices,
    vertexDepth: Float64Array.from(vertexDepth),
    vertexRow: Int32Array.from(vertexRow),
    rows,
    triangles,
    axialCap: mechanics.axialCapRatio * compressionPole.P,
    compressionPole,
    tensionPole
  }
}

export type OracleHit = { lambda: number; triangle: number }

/**
 * Exact first positive ray parameter through a bounding-volume hierarchy; no angular binning.
 * Nodes and bounds are typed arrays and the build partitions at the centroid midpoint, so a few
 * million triangles stay within memory and time.
 */
export class OracleRayMesh {
  private readonly positions: Float64Array
  private readonly order: Int32Array
  private readonly centroids: Float64Array
  private bounds = new Float64Array(6 * 1024)
  private links = new Int32Array(4 * 1024)
  private nodeCount = 0

  constructor(private readonly surface: OracleSurface, private readonly forceScale: number, private readonly momentScale: number) {
    this.positions = new Float64Array(surface.vertices.length * 3)
    surface.vertices.forEach((vertex, index) => {
      this.positions[3 * index] = vertex.P / forceScale
      this.positions[3 * index + 1] = vertex.Mx / momentScale
      this.positions[3 * index + 2] = vertex.My / momentScale
    })
    const count = surface.triangles.length / 3
    this.order = new Int32Array(count)
    this.centroids = new Float64Array(count * 3)
    for (let triangle = 0; triangle < count; triangle += 1) {
      this.order[triangle] = triangle
      for (let axis = 0; axis < 3; axis += 1) {
        this.centroids[3 * triangle + axis] = (
          this.coordinate(surface.triangles[3 * triangle], axis) +
          this.coordinate(surface.triangles[3 * triangle + 1], axis) +
          this.coordinate(surface.triangles[3 * triangle + 2], axis)
        ) / 3
      }
    }
    this.build(0, count)
  }

  private coordinate(vertex: number, axis: number) {
    return this.positions[3 * vertex + axis]
  }

  private allocate() {
    if (this.nodeCount * 6 >= this.bounds.length) {
      const bounds = new Float64Array(this.bounds.length * 2); bounds.set(this.bounds); this.bounds = bounds
      const links = new Int32Array(this.links.length * 2); links.set(this.links); this.links = links
    }
    return this.nodeCount++
  }

  private build(start: number, end: number): number {
    const node = this.allocate()
    const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]
    const centroidBox = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]
    for (let cursor = start; cursor < end; cursor += 1) {
      const triangle = this.order[cursor]
      for (let corner = 0; corner < 3; corner += 1) {
        const vertex = this.surface.triangles[3 * triangle + corner]
        for (let axis = 0; axis < 3; axis += 1) {
          const value = this.coordinate(vertex, axis)
          if (value < box[axis]) box[axis] = value
          if (value > box[axis + 3]) box[axis + 3] = value
        }
      }
      for (let axis = 0; axis < 3; axis += 1) {
        const value = this.centroids[3 * triangle + axis]
        if (value < centroidBox[axis]) centroidBox[axis] = value
        if (value > centroidBox[axis + 3]) centroidBox[axis + 3] = value
      }
    }
    this.bounds.set(box, 6 * node)
    this.links.set([-1, -1, start, end - start], 4 * node)
    if (end - start <= 8) return node
    let axis = 0
    for (let candidate = 1; candidate < 3; candidate += 1) {
      if (centroidBox[candidate + 3] - centroidBox[candidate] > centroidBox[axis + 3] - centroidBox[axis]) axis = candidate
    }
    const split = (centroidBox[axis] + centroidBox[axis + 3]) / 2
    let low = start
    let high = end - 1
    while (low <= high) {
      if (this.centroids[3 * this.order[low] + axis] < split) low += 1
      else {
        const swap = this.order[low]; this.order[low] = this.order[high]; this.order[high] = swap
        high -= 1
      }
    }
    const middle = low === start || low === end ? start + Math.floor((end - start) / 2) : low
    const left = this.build(start, middle)
    const right = this.build(middle, end)
    this.links.set([left, right, start, 0], 4 * node)
    return node
  }

  private triangleHit(triangle: number, d0: number, d1: number, d2: number): number | null {
    const triangles = this.surface.triangles
    const a = triangles[3 * triangle]
    const b = triangles[3 * triangle + 1]
    const c = triangles[3 * triangle + 2]
    const ax = this.coordinate(a, 0); const ay = this.coordinate(a, 1); const az = this.coordinate(a, 2)
    const e1x = this.coordinate(b, 0) - ax; const e1y = this.coordinate(b, 1) - ay; const e1z = this.coordinate(b, 2) - az
    const e2x = this.coordinate(c, 0) - ax; const e2y = this.coordinate(c, 1) - ay; const e2z = this.coordinate(c, 2) - az
    const hx = d1 * e2z - d2 * e2y
    const hy = d2 * e2x - d0 * e2z
    const hz = d0 * e2y - d1 * e2x
    const determinant = e1x * hx + e1y * hy + e1z * hz
    if (Math.abs(determinant) < 1e-20) return null
    const inverse = 1 / determinant
    const sx = -ax; const sy = -ay; const sz = -az
    const u = inverse * (sx * hx + sy * hy + sz * hz)
    if (u < -1e-12 || u > 1 + 1e-12) return null
    const qx = sy * e1z - sz * e1y
    const qy = sz * e1x - sx * e1z
    const qz = sx * e1y - sy * e1x
    const v = inverse * (d0 * qx + d1 * qy + d2 * qz)
    if (v < -1e-12 || u + v > 1 + 1e-12) return null
    const t = inverse * (e2x * qx + e2y * qy + e2z * qz)
    return t > 1e-12 ? t : null
  }

  /** First crossing of lambda * demand with the capped Design boundary; triangle -1 is the cap. */
  firstExit(demand: Resultant): OracleHit | null {
    const d = [demand.P / this.forceScale, demand.Mx / this.momentScale, demand.My / this.momentScale]
    let best = demand.P > 0 ? this.surface.axialCap / demand.P : Number.POSITIVE_INFINITY
    let bestTriangle = -1
    const stack = [0]
    while (stack.length > 0) {
      const node = stack.pop() as number
      let tMin = 0
      let tMax = best
      let miss = false
      for (let axis = 0; axis < 3 && !miss; axis += 1) {
        const low = this.bounds[6 * node + axis]
        const high = this.bounds[6 * node + axis + 3]
        if (Math.abs(d[axis]) < 1e-300) {
          if (low > 0 || high < 0) miss = true
          continue
        }
        let t0 = low / d[axis]
        let t1 = high / d[axis]
        if (t0 > t1) { const swap = t0; t0 = t1; t1 = swap }
        if (t0 > tMin) tMin = t0
        if (t1 < tMax) tMax = t1
        if (tMin > tMax) miss = true
      }
      if (miss) continue
      const left = this.links[4 * node]
      if (left < 0) {
        const start = this.links[4 * node + 2]
        const count = this.links[4 * node + 3]
        for (let cursor = start; cursor < start + count; cursor += 1) {
          const t = this.triangleHit(this.order[cursor], d[0], d[1], d[2])
          if (t !== null && t < best) { best = t; bestTriangle = this.order[cursor] }
        }
      } else {
        stack.push(left, this.links[4 * node + 1])
      }
    }
    return Number.isFinite(best) ? { lambda: best, triangle: bestTriangle } : null
  }
}

/** Convenience: build the surface and its ray structure with the oracle's own force/moment scales. */
export const createOracle = (
  section: OracleSection,
  mechanics: OracleMechanics,
  options: OracleSurfaceOptions = DEFAULT_ORACLE_OPTIONS
) => {
  const prepared = prepareOracle(section, mechanics)
  const surface = buildOracleDesignSurface(prepared, options)
  let depth = 0
  for (let row = 0; row < 8; row += 1) {
    const theta = (Math.PI * row) / 8
    const { minimum, maximum } = projectionRange(section, { gx: Math.cos(theta), gy: Math.sin(theta) })
    depth = Math.max(depth, maximum - minimum)
  }
  const forceScale = Math.abs(surface.compressionPole.P)
  const mesh = new OracleRayMesh(surface, forceScale, forceScale * depth)
  return { prepared, surface, mesh }
}
