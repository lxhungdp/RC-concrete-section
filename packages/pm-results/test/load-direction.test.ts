import assert from 'node:assert/strict'
import test from 'node:test'
import type { PreviewMomentPlanePath, PreviewSurfacePoint, SurfaceStationId } from '../src/contracts'
import {
  edgeBeta,
  projectLoadDirectionCut,
  type LoadDirectionParametrisation,
  type LoadDirectionState
} from '../src/load-direction'

/**
 * Synthetic analytic mechanics (engineering/05 §3 oracle): a station s ∈ [0, 1] at strain direction β
 * has P = P0·(1 − 2s) and a moment of magnitude R(s) = R0·sin(πs) pointing at β + δ(s). The moment
 * direction therefore differs from β, as on an unsymmetric section, and the exact root of θ is known:
 * β = θ − δ(s) on a ring, and δ(s(τ)) = θ − β along a fixed-β meridian edge.
 */
const P0 = 1e6, R0 = 2e8
const delta = (s: number) => 0.2 + 0.3 * s
const stateAt = (beta: number, s: number): LoadDirectionState => {
  const R = R0 * Math.sin(Math.PI * s)
  return { P: P0 * (1 - 2 * s), Mx: R * Math.cos(beta + delta(s)), My: R * Math.sin(beta + delta(s)), beta }
}
const stationCoordinate = new Map<string, number>()
const vertex = (beta: number, s: number, id: string, role: PreviewSurfacePoint['surfaceRole'] = 'physical-state'): PreviewSurfacePoint => {
  stationCoordinate.set(id, s)
  const value = stateAt(beta, s)
  return {
    id: `${id}@${beta}`, beta, station: s, stationId: id as SurfaceStationId, surfaceRole: role,
    state: { e0: 0, kx: 0, ky: 0 }, ledger: { total: { P: value.P, Mx: value.Mx, My: value.My } } as PreviewSurfacePoint['ledger'],
    P: value.P, Mx: value.Mx, My: value.My
  }
}
const analytic: LoadDirectionParametrisation = (a, b) => {
  const sa = stationCoordinate.get(a.stationId!), sb = stationCoordinate.get(b.stationId!)
  if (sa === undefined || sb === undefined) return null
  return (tau) => stateAt(edgeBeta(a, b, tau), sa + tau * (sb - sa))
}
const offset = (point: { Mx: number; My: number }, theta: number) => point.My * Math.cos(theta) - point.Mx * Math.sin(theta)
/** A cut point at the geometric crossing of the straight chord a→b with the θ plane. */
const crossing = (a: PreviewSurfacePoint, b: PreviewSurfacePoint, theta: number) => {
  const t = offset(a, theta) / (offset(a, theta) - offset(b, theta))
  const P = a.P + t * (b.P - a.P), Mx = a.Mx + t * (b.Mx - a.Mx), My = a.My + t * (b.My - a.My)
  return { beta: theta, station: 0, P, Mx, My, M: Mx * Math.cos(theta) + My * Math.sin(theta), source: { a, b, t } }
}
const single = (points: PreviewMomentPlanePath['points'], closed = false): PreviewMomentPlanePath[] => [{ points, closed }]
/** One crossing followed by a geometric tension-side point, so the forward run has two points. */
const withTail = (point: PreviewMomentPlanePath['points'][number]) =>
  single([point, { ...point, P: -P0, Mx: 0, My: 0, M: 0, source: undefined }])

test('ENG-AN-003: a ring crossing lands on the analytic root β = θ − δ(s) with its station identity', () => {
  const theta = 0.9, s = 0.4
  const a = vertex(0.3, s, 'station-2'), b = vertex(0.7, s, 'station-2')
  const paths = withTail(crossing(a, b, theta))
  const curve = projectLoadDirectionCut({ theta, design: { paths, parametrise: analytic }, nominal: { paths, parametrise: analytic }, cap: null })
  const point = curve.designPaths[0][0]
  assert.ok(point)
  assert.equal(point.role, 'physical-station')
  assert.equal(point.stationId, 'station-2')
  assert.ok(Math.abs(point.beta! - (theta - delta(s))) < 1e-9)
  const exact = stateAt(theta - delta(s), s)
  assert.ok(Math.abs(point.P - exact.P) <= 1e-9 * P0)
  assert.ok(Math.abs(point.Mtheta - R0 * Math.sin(Math.PI * s)) <= 1e-8 * R0)
  assert.ok(Math.abs(point.directionResidual!) <= 1e-9)
  assert.deepEqual(curve.unresolved, [])
  assert.deepEqual(curve.discontinuities, [])
})

test('ENG-AN-003: a meridian crossing is a compatible state between two stations at its own fraction', () => {
  const theta = 0.6, beta = 0.25
  // δ(s) = θ − β gives s = (θ − β − 0.2)/0.3 between the two stations.
  const a = vertex(beta, 0.2, 'station-3'), b = vertex(beta, 0.8, 'station-4')
  const curve = projectLoadDirectionCut({ theta, design: { paths: withTail(crossing(a, b, theta)), parametrise: analytic },
    nominal: { paths: [], parametrise: analytic }, cap: null })
  const point = curve.designPaths.flat().find((item) => item.role === 'between-stations')
  assert.ok(point && point.between)
  const s = (theta - beta - 0.2) / 0.3
  assert.equal(point.between.from, 'station-3')
  assert.equal(point.between.to, 'station-4')
  assert.ok(Math.abs(0.2 + point.between.fraction * 0.6 - s) < 1e-9)
  assert.ok(Math.abs(point.beta! - beta) < 1e-15)
})

test('ENG-AN-003: β interpolates the short way across 2π and the root is wrapped', () => {
  const s = 0.5, theta = 0.25
  const a = vertex(2 * Math.PI - 0.2, s, 'station-5'), b = vertex(0.3, s, 'station-5')
  const paths = withTail(crossing(a, b, theta))
  const curve = projectLoadDirectionCut({ theta, design: { paths, parametrise: analytic }, nominal: { paths: [], parametrise: analytic }, cap: null })
  const point = curve.designPaths.flat().find((item) => item.role === 'physical-station')
  assert.ok(point)
  const expected = ((theta - delta(s)) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI)
  assert.ok(Math.abs(point.beta! - expected) < 1e-9, `${point.beta} vs ${expected}`)
})

test('ENG-AN-003: a jump across θ is a reported discontinuity; no family is geometric and unresolved', () => {
  const theta = 0.9
  const a = vertex(0.3, 0.4, 'station-6'), b = vertex(0.7, 0.4, 'station-6')
  // The moment points 1e-5 rad below θ for τ < 0.5 and 1e-5 rad above it after: it never meets θ.
  const jumping: LoadDirectionParametrisation = (left, right) => (tau) => {
    const value = stateAt(edgeBeta(left, right, tau), 0.4)
    const R = Math.hypot(value.Mx, value.My), angle = theta + (tau < 0.5 ? -1e-5 : 1e-5)
    return { ...value, Mx: R * Math.cos(angle), My: R * Math.sin(angle) }
  }
  const paths = withTail(crossing(a, b, theta))
  const curve = projectLoadDirectionCut({ theta, design: { paths, parametrise: jumping },
    nominal: { paths, parametrise: () => null }, cap: null })
  assert.equal(curve.discontinuities.length, 1)
  assert.ok(Math.abs(Math.abs(curve.discontinuities[0].directionResidual) - Math.sin(1e-5)) < 1e-9)
  assert.ok(curve.maxDirectionResidual >= Math.abs(curve.discontinuities[0].directionResidual))
  assert.equal(curve.nominalPaths.flat()[0].role, 'interpolated')
  assert.deepEqual(curve.unresolved.map((item) => [item.stage, item.reason]), [['nominal', 'no-direction']])
})

test('ENG-AN-003: a closed cut keeps only Mθ ≥ 0, oriented compression to tension, and is clipped at the cap', () => {
  const theta = 0
  // A closed loop through both half-planes on fixed meridians β = 0 (forward) and β = π (back).
  const compression = vertex(0, 0, 'pure-compression', 'pure-compression')
  const tension = vertex(0, 1, 'pure-tension', 'pure-tension')
  const forward = [0.25, 0.5, 0.75].map((s, index) => vertex(-delta(s), s, `station-${index + 1}`))
  const back = [0.75, 0.5, 0.25].map((s, index) => vertex(Math.PI - delta(s), s, `station-${3 - index}`))
  const on = (point: PreviewSurfacePoint) => ({ beta: theta, station: 0, P: point.P, Mx: point.Mx, My: point.My,
    M: point.Mx, source: { a: point, b: point, t: 0 } })
  // Start in the back half so the forward run wraps around the loop start.
  const loop = [back[1], back[2], compression, ...forward, tension, back[0], back[1]].map(on)
  const cap = 0.6 * P0
  const curve = projectLoadDirectionCut({ theta, design: { paths: single(loop, true), parametrise: analytic },
    nominal: { paths: single(loop, true), parametrise: analytic }, cap })
  assert.equal(curve.nominalPaths.length, 1)
  const nominal = curve.nominalPaths[0]
  assert.deepEqual(nominal.map((point) => point.role),
    ['pure-compression', 'physical-station', 'physical-station', 'physical-station', 'pure-tension'])
  assert.ok(nominal.every((point, index) => index === 0 || point.P < nominal[index - 1].P))
  assert.ok(nominal.every((point) => point.Mtheta >= 0))
  // Design: the cap face from the axis to the crossing, then the physical states below the cap.
  assert.equal(curve.designPaths.length, 1)
  const design = curve.designPaths[0]
  assert.deepEqual(design.slice(0, 2).map((point) => point.role), ['axial-center', 'cap-edge'])
  assert.ok(design.every((point) => point.P <= cap))
  assert.ok(curve.beforeAxialCapPaths.flat().some((point) => point.role === 'pure-compression'))
})

test('ENG-AN-003: back-half crossings are never projected and Nominal first tries the Design root of the same edge', () => {
  const theta = 0.9, s = 0.4
  const ring = (betaA: number, betaB: number) => [vertex(betaA, s, 'station-7'), vertex(betaB, s, 'station-7')] as const
  const [fa, fb] = ring(0.3, 0.7)
  // The same edge seen from the back: moment along θ + π.
  const [ba, bb] = ring(0.3 + Math.PI, 0.7 + Math.PI)
  const calls = { design: 0, nominal: 0, back: 0 }
  const counted = (stage: 'design' | 'nominal'): LoadDirectionParametrisation => (a, b) => {
    const family = analytic(a, b)!
    return (tau) => {
      if (a.beta > Math.PI) calls.back += 1
      else calls[stage] += 1
      return family(tau)
    }
  }
  const paths = single([crossing(fa, fb, theta), crossing(ba, bb, theta), { ...crossing(fa, fb, theta), P: -P0, Mx: 0, My: 0, M: 0, source: undefined }])
  const curve = projectLoadDirectionCut({ theta, design: { paths, parametrise: counted('design') },
    nominal: { paths, parametrise: counted('nominal') }, cap: null })
  assert.equal(calls.back, 0, 'a crossing behind the axis is dropped without evaluation')
  assert.ok(calls.design >= 3)
  assert.equal(calls.nominal, 1, 'the Design root of the shared edge passes the Nominal residual test at once')
  const design = curve.designPaths.flat().find((point) => point.role === 'physical-station')!
  const nominal = curve.nominalPaths.flat().find((point) => point.role === 'physical-station')!
  assert.equal(nominal.beta, design.beta)
  assert.ok(Math.abs(nominal.directionResidual!) <= 1e-9)
})
