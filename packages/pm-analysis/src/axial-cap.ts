import { triangulateIndexedLoop } from '@pm/geometry'
import { axialCapEdgeIntersection } from './axial-cap-intersection'
import { AnalysisInputError } from './analysis-error'
import { type PreviewSurfaceDataset, type PreviewSurfacePoint,
  type Resultant, type ResultantLedger, type SurfaceIndexTriangle } from './index'

/** Exact geometric half-space operation. No material state is evaluated at a cap vertex. */
export const clipDesignSurfaceAtAxialCap = (
  dataset: PreviewSurfaceDataset, cap: number, maximum: number, ratio: number
): PreviewSurfaceDataset => {
  const fail = (message: string): never => { throw new AnalysisInputError('INVALID_RESISTANCE_SURFACE', message) }
  if (![cap, maximum, ratio].every(Number.isFinite)) fail('Axial-cap geometry requires finite limits.')
  if (!dataset.points.length || cap >= maximum) return dataset
  const source = dataset.points
  if (source.some(p => ![p.P, p.Mx, p.My].every(Number.isFinite))) fail('Non-finite Design geometry.')
  const points: PreviewSurfacePoint[] = []
  const oldMap = new Map<number, number>()
  const edgeMap = new Map<string, number>()
  const tracePoint = (point: PreviewSurfacePoint) => ({ pointId: point.id, stationId: point.stationId,
    P: point.P, Mx: point.Mx, My: point.My })
  const mapped = (index: number) => {
    const known = oldMap.get(index)
    if (known !== undefined) return known
    const point = source[index]
    if (!point) return fail('Invalid source vertex in axial-cap topology.')
    const result = points.length
    points.push(point)
    oldMap.set(index, result)
    return result
  }
  const intersection = (ai: number, bi: number) => {
    const key = ai < bi ? `${ai}:${bi}` : `${bi}:${ai}`
    const known = edgeMap.get(key)
    if (known !== undefined) return known
    const a = source[ai]; const b = source[bi]
    if (!a || !b) return fail('Invalid source edge in axial-cap topology.')
    if (a.P === cap) return mapped(ai)
    if (b.P === cap) return mapped(bi)
    let cut: ReturnType<typeof axialCapEdgeIntersection>
    try { cut = axialCapEdgeIntersection(a,b,cap) }
    catch (error) { return fail(error instanceof Error ? error.message : 'Invalid axial-cap intersection.') }
    const { point: crossing, fractionFromA: t } = cut
    if (!Number.isFinite(t) || t < 0 || t > 1) return fail('The cap plane does not straddle its source edge.')
    const lerp = (x: number, y: number) => x + t * (y - x)
    const resultant = (x: Resultant, y: Resultant): Resultant => ({ P: lerp(x.P, y.P),
      Mx: lerp(x.Mx, y.Mx), My: lerp(x.My, y.My) })
    const ledger: ResultantLedger = { concrete: resultant(a.ledger.concrete,b.ledger.concrete),
      steelGross: resultant(a.ledger.steelGross,b.ledger.steelGross),
      displacedConcrete: resultant(a.ledger.displacedConcrete,b.ledger.displacedConcrete),
      steel: resultant(a.ledger.steel,b.ledger.steel), total: resultant(a.ledger.total,b.ledger.total) }
    const pole = (p: PreviewSurfacePoint) => p.surfaceRole === 'pure-compression' || p.surfaceRole === 'pure-tension'
    const onMeridian = a.beta === b.beta || pole(a) || pole(b)
    const beta = pole(a) ? b.beta : a.beta
    const compression = a.P > b.P ? a : b
    const admissible = a.P > b.P ? b : a
    const index = points.length
    points.push({ ...crossing, id: `axial-cap:${key}`, beta, station: lerp(a.station, b.station),
      stationCoordinate: lerp(a.stationCoordinate ?? a.station, b.stationCoordinate ?? b.station),
      stationId: null, surfaceRole: 'axial-cap', onSampledDirection: onMeridian,
      // Required DTO slot only. The role/provenance explicitly forbids treating this as a strain plane.
      state: { e0: 0, kx: 0, ky: 0 }, ledger,
      resistance: compression.resistance ? { ...compression.resistance, axialCapApplied: true,
        stages: [...compression.resistance.stages, 'maximum-axial-resistance-cap'] } : undefined,
      axialCapTrace: { maximumAxialResistance: maximum, capRatio: ratio, cap,
        preCapPoint: compression,
        source: { kind: 'edge-interpolation', compressionSide: tracePoint(compression),
          admissibleSide: tracePoint(admissible), interpolationRatio: compression === a ? t : 1 - t,
          crossing }, projection: { kind: 'identity', factor: 1 } } })
    edgeMap.set(key, index)
    return index
  }
  if (dataset.directions.length === 1) {
    // Exact-beta queries are a polyline, not a volume. Keep the original station ordering.
    for (let i = 0; i < source.length; i++) {
      if (source[i].P <= cap) mapped(i)
      if (i && (source[i - 1].P <= cap) !== (source[i].P <= cap)) intersection(i - 1, i)
    }
    return { ...dataset, points: points.sort((a, b) => a.station - b.station), triangles: [] }
  }
  if (!dataset.triangles?.length) return fail('Explicit source topology is required for axial clipping.')
  const triangles: SurfaceIndexTriangle[] = []
  for (const triangle of dataset.triangles) {
    const original = [triangle.a, triangle.b, triangle.c]
    const polygon: number[] = []
    for (let i = 0; i < 3; i++) {
      const ai = original[i]; const bi = original[(i + 1) % 3]
      const a = source[ai]; const b = source[bi]
      if (!a || !b) return fail('Invalid source triangle in axial-cap topology.')
      const insideA = a.P <= cap; const insideB = b.P <= cap
      if (insideA) polygon.push(mapped(ai))
      if (insideA !== insideB) polygon.push(intersection(ai, bi))
    }
    const clean = polygon.filter((id, i) => !i || id !== polygon[i - 1])
    if (clean.length > 1 && clean[0] === clean[clean.length - 1]) clean.pop()
    if (clean.every(i => points[i].P === cap)) continue
    for (let i = 1; i < clean.length - 1; i++) triangles.push({ a: clean[0], b: clean[i], c: clean[i + 1] })
  }
  // Shared-pole topology can leave equivalent reporting copies unused by triangles. Retain every
  // original below-cap point as well; clipping changes neither its identity nor its material state.
  for (let index=0;index<source.length;index++) if (source[index].P<=cap) mapped(index)
  // Open side-face edges on Pmax form the actual cap loops; no radial ring or convex hull.
  const edges = new Map<string, { a: number; b: number; count: number }>()
  for (const t of triangles) for (const [a, b] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]]) {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`
    const edge = edges.get(key)
    if (edge) edge.count++
    else edges.set(key, { a, b, count: 1 })
  }
  const adjacency = new Map<number, number[]>()
  const open = new Map<string, { a: number; b: number; count: number }>()
  for (const [key, edge] of edges) {
    if (edge.count > 2) fail('Non-manifold clipped Design side faces.')
    if (edge.count !== 1) continue
    if (points[edge.a].P !== cap || points[edge.b].P !== cap) fail('Open Design side face away from Pmax.')
    open.set(key, edge)
    adjacency.set(edge.a, [...(adjacency.get(edge.a) ?? []), edge.b])
    adjacency.set(edge.b, [...(adjacency.get(edge.b) ?? []), edge.a])
  }
  if ([...adjacency.values()].some(neighbours => neighbours.length !== 2)) fail('Ambiguous axial-cap boundary.')
  const loops: number[][] = []
  while (open.size) {
    const first = open.values().next().value
    if (!first) break
    const loop = [first.a]
    let previous = first.a; let current = first.b
    const key = (a: number, b: number) => a < b ? `${a}:${b}` : `${b}:${a}`
    open.delete(key(previous, current))
    while (current !== loop[0] && loop.length <= adjacency.size) {
      loop.push(current)
      const next = adjacency.get(current)?.find(index => index !== previous)
      if (next === undefined) return fail('Unclosed axial-cap boundary.')
      if (!open.delete(key(current, next))) return fail('Unclosed axial-cap boundary.')
      previous = current; current = next
    }
    if (current !== loop[0] || loop.length < 3) fail('Collapsed axial-cap boundary.')
    loops.push(loop)
  }
  const momentScale = points.reduce((scale,p) => Math.max(scale,Math.abs(p.Mx),Math.abs(p.My)),1)
  const planar = points.map(p => ({ x: p.Mx / momentScale, y: p.My / momentScale }))
  const inside = (index: number, loop: number[]) => {
    const p = planar[index]; let result = false
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
      const a = planar[loop[i]]; const b = planar[loop[j]]
      if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) result = !result
    }
    return result
  }
  if (loops.some((loop, i) => loops.some((other, j) => i !== j && inside(loop[0], other)))) {
    fail('Nested axial-cap loops require an explicitly supported hole triangulation.')
  }
  for (const loop of loops) {
    let capTriangles: SurfaceIndexTriangle[]
    try { capTriangles = triangulateIndexedLoop(loop, planar, 1e-9) }
    catch (error) { return fail(error instanceof Error ? error.message : 'Cap triangulation failed.') }
    const a = loop[0]; const b = loop[1]
    const edge = edges.get(a < b ? `${a}:${b}` : `${b}:${a}`)
    if (!edge) return fail('Missing cap boundary incidence.')
    const sameDirection = (t: SurfaceIndexTriangle) => [[t.a,t.b],[t.b,t.c],[t.c,t.a]]
      .some(([left,right]) => left === edge.a && right === edge.b)
    if (capTriangles.some(sameDirection)) capTriangles = capTriangles.map(t => ({ a:t.a, b:t.c, c:t.b }))
    triangles.push(...capTriangles)
  }
  return { ...dataset, points, triangles }
}
