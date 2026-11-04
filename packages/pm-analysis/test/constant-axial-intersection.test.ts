import assert from 'node:assert/strict'
import test from 'node:test'
import { checkLoadcaseUtilizationFromSurface, intersectSurfaceAtConstantAxial, type PreviewSurface, type PreviewSurfacePoint } from '../src/index'

type Corner = readonly [number, number, number]

const vertex = (index: number, [P, Mx, My]: Corner) => ({
  id: `v-${index}`,
  beta: 0,
  P,
  Mx,
  My,
  state: { e0: 0, kx: 0, ky: 0 }
}) as unknown as PreviewSurfacePoint

/** A closed tetrahedron whose faces are the four corner triples. */
const tetrahedron = (first: number): Array<[number, number, number]> => [
  [first, first + 2, first + 1],
  [first, first + 1, first + 3],
  [first, first + 3, first + 2],
  [first + 1, first + 2, first + 3]
]

const surfaceOf = (corners: readonly Corner[], bodies: number): PreviewSurface => {
  const points = corners.map((corner, index) => vertex(index, corner))
  const values = (read: (point: PreviewSurfacePoint) => number) => points.map(read)
  const extent = (read: (point: PreviewSurfacePoint) => number): [number, number] =>
    [Math.min(...values(read)), Math.max(...values(read))]
  return {
    analysisOptions: { samplingMode: 'fixed', methodId: 'strain-domain-surface-v1' },
    directionError: { withinTolerance: true, maxRelativeComponent: 0 },
    stationError: { withinTolerance: true, maxRelative: 0 },
    points,
    triangles: Array.from({ length: bodies }, (_, body) => tetrahedron(body * 4)).flat()
      .map(([a, b, c]) => ({ a, b, c })),
    bounds: { P: extent((point) => point.P), Mx: extent((point) => point.Mx), My: extent((point) => point.My) }
  } as unknown as PreviewSurface
}

/** A body enclosing the axis at P = 0 and one placed at larger Mx on the same ray. */
const aroundAxis: Corner[] = [[-10, -10, -10], [-10, 30, -10], [-10, -10, 30], [10, 1, 1]]
const fartherOut: Corner[] = [[-10, 50, -10], [-10, 90, -10], [-10, 50, 30], [10, 61, 1]]
const demand = { P: 0, Mx: 5, My: 0 }

test('docs/07 section 4: one exit from an interior axis publishes the boundary moment at Pu', () => {
  const result = intersectSurfaceAtConstantAxial(surfaceOf(aroundAxis, 1), demand)
  assert.equal(result.status, 'crossing')
  if (result.status !== 'crossing') return
  assert.equal(result.intersection.point.P, 0)
  assert.equal(result.intersection.point.My, 0)
  assert.ok(result.intersection.point.Mx > 5)
  assert.equal(result.intersection.point.Mx, 5 * result.intersection.lambda)
})

test('docs/07 section 4: an axis outside the domain publishes no ratio', () => {
  assert.equal(intersectSurfaceAtConstantAxial(surfaceOf(fartherOut, 1), demand).status, 'axis-outside-domain')
})

test('docs/07 section 4: leaving the domain more than once publishes no ratio', () => {
  const result = intersectSurfaceAtConstantAxial(surfaceOf([...aroundAxis, ...fartherOut], 2), demand)
  assert.equal(result.status, 'non-unique-exit')
})

test('engineering/05 section 3: Pu beyond either axial bound is outside the domain', () => {
  const surface = surfaceOf(aroundAxis, 1)
  assert.equal(intersectSurfaceAtConstantAxial(surface, { ...demand, P: 10.001 }).status, 'axial-outside-domain')
  assert.equal(intersectSurfaceAtConstantAxial(surface, { ...demand, P: -10.001 }).status, 'axial-outside-domain')
})

test('engineering/05 section 3: zero moment is unavailable, never UR = 0', () => {
  assert.equal(intersectSurfaceAtConstantAxial(surfaceOf(aroundAxis, 1), { P: 0, Mx: 0, My: 0 }).status, 'zero-moment')
})

for (const angle of [0, Math.PI / 2, 0.37, 2.1]) {
  const rotate = ([P, Mx, My]: Corner): Corner => [P, Mx * Math.cos(angle) - My * Math.sin(angle), Mx * Math.sin(angle) + My * Math.cos(angle)]
  test(`ENG-AN-003 CP-A01: an exterior axis cannot pass a vertex tangency (rotation ${angle})`, () => {
    // The global origin is strictly inside (the four-vertex centroid). At P=.5 the slice is
    // (-1,0),(0,1),(1,1): its origin is outside and the negative-Mx ray only touches (-1,0).
    const surface = surfaceOf(([[-.5,-2,-2],[-.5,0,0],[-.5,2,0],[1.5,0,2]] as Corner[]).map(rotate), 1)
    const [P, Mx, My] = rotate([.5,-.25,0])
    assert.equal(intersectSurfaceAtConstantAxial(surface, { P, Mx, My }).status, 'axis-outside-domain')
    const check = checkLoadcaseUtilizationFromSurface(surface, { id: 1, name: 'Tangent', actionBasis: 'factoredULS', P, Mx, My }, 'constantAxial')
    assert.equal(check.utilization, null)
    assert.equal(check.adequacy, 'indeterminate')
  })
  test(`ENG-AN-003: a genuine shared-edge crossing is retained (rotation ${angle})`, () => {
    const result = intersectSurfaceAtConstantAxial(surfaceOf(aroundAxis.map(rotate), 1), (() => {
      const [P, Mx, My] = rotate([0,15.5,-4.5]); return { P, Mx, My }
    })())
    assert.equal(result.status, 'crossing')
    if (result.status === 'crossing') assert.ok(Math.abs(result.intersection.lambda - 1) < 1e-9)
  })
}

const cube = (offsetMy = 0): PreviewSurface => {
  const corners: Corner[] = [-1,1].flatMap(P => [[P,-2,-2+offsetMy],[P,2,-2+offsetMy],[P,2,2+offsetMy],[P,-2,2+offsetMy]] as Corner[])
  const result = surfaceOf(corners, 0)
  result.triangles = [[0,2,1],[0,3,2],[4,5,6],[4,6,7], ...[0,1,2,3].flatMap(i => {
    const next = (i+1)%4; return [[i,next,next+4],[i,next+4,i+4]]
  })].map(([a,b,c])=>({a,b,c}))
  return result
}

test('ENG-AN-003: shared face, edge and vertex exits, including a horizontal axial-bound face', () => {
  for (const P of [0,1,-1]) for (const [Mx,My] of [[1,0],[1,1]]) {
    const result = intersectSurfaceAtConstantAxial(cube(), {P,Mx,My})
    assert.equal(result.status,'crossing')
    if(result.status==='crossing') assert.ok(Math.abs(result.intersection.lambda-2)<1e-9)
  }
})

test('ENG-AN-003: a coplanar side-boundary start is unavailable', () => {
  assert.equal(intersectSurfaceAtConstantAxial(cube(2), {P:0,Mx:1,My:0}).status,'geometric-ambiguity')
})

test('ENG-AN-003: an interior start plus a remote tangent is not a unique qualified exit', () => {
  // At P=0 the second body's slice is (4,0),(5,1),(6,1), touched after the first exit.
  const tangent: Corner[] = [[-1,3,1],[-1,5,3],[-1,7,3],[1,5,-1]]
  const first: Corner[] = [[-1,-1,-1],[-1,3,-1],[-1,-1,3],[1,0,0]]
  const result=intersectSurfaceAtConstantAxial(surfaceOf([...first,...tangent],2), {P:0,Mx:1,My:0})
  assert.equal(result.status,'geometric-ambiguity')
})
