import assert from 'node:assert/strict'
import test from 'node:test'
import {
  brentRoot,
  buildCapacitySurface,
  clipCapacitySurfaceByAxialCap,
  createElasticPerfectlyPlasticSteelLaw,
  evaluateEquivalentBlock,
  evaluateSurfaceTopology,
  intersectCapacitySurfaceWithRay,
  prepareEquivalentBlockSection,
  solveFixedAxialCapacity,
  solveProportionalRayCapacity,
  type BlockSectionState,
  type CapacityEndpoint,
  type CapacityEvaluator,
  type CapacitySurface,
  type EquivalentBlockSection,
  type NominalBlockEvaluation,
  type Point2
} from '../src/index'

const close = (actual: number, expected: number, relative = 1e-7) => {
  const scale = Math.max(1, Math.abs(actual), Math.abs(expected))
  assert.ok(Math.abs(actual - expected) <= relative * scale, `${actual} != ${expected}`)
}

const rectangle = (width: number, height: number): Point2[] => [
  { x: -width / 2, y: -height / 2 },
  { x: width / 2, y: -height / 2 },
  { x: width / 2, y: height / 2 },
  { x: -width / 2, y: height / 2 }
]

const createFixture = () => {
  const barArea = 500
  const section: EquivalentBlockSection = {
    solids: [{ outer: rectangle(400, 500) }],
    rebars: [
      { id: 'bl', x: -150, y: -200, area: barArea, steelLawId: 'steel' },
      { id: 'br', x: 150, y: -200, area: barArea, steelLawId: 'steel' },
      { id: 'tr', x: 150, y: 200, area: barArea, steelLawId: 'steel' },
      { id: 'tl', x: -150, y: 200, area: barArea, steelLawId: 'steel' }
    ],
    referencePoint: { x: 0, y: 0 },
    units: 'N-mm-MPa',
    signConvention: 'compression-positive'
  }
  const prepared = prepareEquivalentBlockSection(section)
  const law = {
    compressionStress: 25.5,
    depthFactor: 0.8,
    extremeCompressionStrain: 0.003,
    subtractDisplacedConcrete: true
  }
  const steel = createElasticPerfectlyPlasticSteelLaw(200_000, 400)
  const evaluator: CapacityEvaluator = (state: BlockSectionState) => {
    const source = evaluateEquivalentBlock(prepared, law, { steel }, state)
    return { state, resultants: source.resultants, source }
  }
  const tensionPole: CapacityEndpoint = {
    resultants: { P: -4 * barArea * 400, Mx: 0, My: 0 }
  }
  const compressionPole: CapacityEndpoint = {
    resultants: {
      P: law.compressionStress * 400 * 500 + 4 * barArea * (400 - law.compressionStress),
      Mx: 0,
      My: 0
    }
  }
  return { prepared, law, evaluator, tensionPole, compressionPole }
}

test('Brent solver converges on a bracketed nonlinear root', () => {
  const result = brentRoot((value) => value ** 3 - 2, 0, 2)
  close(result.root, Math.cbrt(2), 1e-10)
  assert.ok(Math.abs(result.value) < 1e-9)
  assert.ok(result.iterations < 30)
})

test('surface meshing is closed and adaptive direction checks remain bounded', () => {
  const fixture = createFixture()
  const surface = buildCapacitySurface(fixture.prepared, fixture.evaluator, {
    extremeCompressionStrain: fixture.law.extremeCompressionStrain,
    tensionPole: fixture.tensionPole,
    compressionPole: fixture.compressionPole,
    seedDirections: 12,
    directionTolerance: 0.02,
    maxRefinementPasses: 2,
    maxDirections: 48
  })
  assert.equal(surface.topology.closed, true, JSON.stringify(surface.topology))
  assert.equal(surface.topology.boundaryEdges, 0)
  assert.equal(surface.topology.nonManifoldEdges, 0)
  assert.equal(surface.topology.degenerateTriangles, 0)
  assert.ok(surface.directions.length >= 12)
  assert.ok(Number.isFinite(surface.maxDirectionalInterpolationError))
  assert.ok(Number.isFinite(surface.maxStationInterpolationError))
})

test('validated 198 by 720 surface limit does not overflow JavaScript argument limits', () => {
  const section = prepareEquivalentBlockSection({
    solids: [{ outer: rectangle(1, 1) }],
    rebars: [],
    referencePoint: { x: 0, y: 0 },
    units: 'N-mm-MPa',
    signConvention: 'compression-positive'
  })
  const stations = Array.from({ length: 198 }, (_, index) => ({
    type: 'depth-ratio' as const,
    ratio: 0.01 * (index + 1)
  }))
  const surface = buildCapacitySurface(section, (state) => ({
    state,
    resultants: {
      P: state.neutralAxisDepth,
      Mx: (1 + state.neutralAxisDepth) * Math.cos(state.neutralAxisAngle),
      My: (1 + state.neutralAxisDepth) * Math.sin(state.neutralAxisAngle)
    }
  }), {
    extremeCompressionStrain: 0.003,
    tensionPole: { resultants: { P: -1, Mx: 0, My: 0 } },
    compressionPole: { resultants: { P: 3, Mx: 0, My: 0 } },
    stations,
    seedDirections: 720,
    maxDirections: 720,
    maxRefinementPasses: 0,
    maxStationRefinementPasses: 0
  })
  assert.equal(surface.points.length, 720 * 198 + 2)
  assert.equal(surface.topology.closed, true)
})

test('station refinement lowers the measured capacity-curve chord error', () => {
  const fixture = createFixture()
  const common = {
    extremeCompressionStrain: fixture.law.extremeCompressionStrain,
    tensionPole: fixture.tensionPole,
    compressionPole: fixture.compressionPole,
    seedDirections: 16,
    maxRefinementPasses: 0
  }
  const coarse = buildCapacitySurface(fixture.prepared, fixture.evaluator, {
    ...common,
    maxStationRefinementPasses: 0
  })
  const refined = buildCapacitySurface(fixture.prepared, fixture.evaluator, {
    ...common,
    stationTolerance: 0.0025,
    maxStationRefinementPasses: 3,
    maxStations: 64
  })
  assert.ok(refined.stations.length >= coarse.stations.length)
  assert.ok(refined.maxStationInterpolationError <= coarse.maxStationInterpolationError + 1e-12)
  assert.equal(refined.topology.closed, true)
})

test('bar-based tension stations never cross a declared steel rupture strain', () => {
  const fixture = createFixture()
  const steel = createElasticPerfectlyPlasticSteelLaw(200_000, 400, 0.02)
  const evaluator: CapacityEvaluator<NominalBlockEvaluation> = (state) => {
    const source = evaluateEquivalentBlock(fixture.prepared, fixture.law, { steel }, state)
    return { state, resultants: source.resultants, source }
  }
  const surface = buildCapacitySurface(fixture.prepared, evaluator, {
    extremeCompressionStrain: fixture.law.extremeCompressionStrain,
    tensionPole: fixture.tensionPole,
    compressionPole: fixture.compressionPole,
    steelLaws: { steel },
    seedDirections: 24,
    maxRefinementPasses: 0,
    maxStationRefinementPasses: 0
  })
  for (const point of surface.points) {
    if (!point.state) continue
    const evaluation = evaluator(point.state).source!
    for (const bar of evaluation.bars) {
      assert.ok(Math.abs(bar.strain) <= 0.02 * (1 + 1e-9), `${bar.id}: ${bar.strain}`)
    }
  }
})

test('surface builder rejects a station schedule that reverses neutral-axis depth', () => {
  const fixture = createFixture()
  assert.throws(() => buildCapacitySurface(fixture.prepared, fixture.evaluator, {
    extremeCompressionStrain: fixture.law.extremeCompressionStrain,
    tensionPole: fixture.tensionPole,
    compressionPole: fixture.compressionPole,
    stations: [
      { type: 'depth-ratio', ratio: 1 },
      { type: 'depth-ratio', ratio: 0.5 }
    ]
  }))
})

test('axial clipping creates a closed cap face at the exact requested force', () => {
  const fixture = createFixture()
  const surface = buildCapacitySurface(fixture.prepared, fixture.evaluator, {
    extremeCompressionStrain: fixture.law.extremeCompressionStrain,
    tensionPole: fixture.tensionPole,
    compressionPole: fixture.compressionPole,
    seedDirections: 24,
    maxRefinementPasses: 0
  })
  const axialCap = fixture.compressionPole.resultants.P * 0.8
  const clipped = clipCapacitySurfaceByAxialCap(surface, axialCap)
  assert.equal(clipped.topology.closed, true)
  assert.ok(clipped.points.some((point) => point.kind === 'axial-cap'))
  close(Math.max(...clipped.points.map((point) => point.resultants.P)), axialCap, 1e-12)
  assert.ok(clipped.triangles.some((triangle) =>
    [triangle.a, triangle.b, triangle.c].every((index) => clipped.points[index].kind === 'axial-cap')
  ))
  const pureCompressionRay = solveProportionalRayCapacity(clipped, { P: 1, Mx: 0, My: 0 })
  assert.equal(pureCompressionRay.status, 'cap-face-governed')
  close(pureCompressionRay.loadFactor!, axialCap, 1e-10)
})

test('ray intersection returns the analytical octahedron boundary', () => {
  const pointValues = [
    { P: 1, Mx: 0, My: 0 }, { P: -1, Mx: 0, My: 0 },
    { P: 0, Mx: 1, My: 0 }, { P: 0, Mx: -1, My: 0 },
    { P: 0, Mx: 0, My: 1 }, { P: 0, Mx: 0, My: -1 }
  ]
  const surface: CapacitySurface = {
    points: pointValues.map((resultants, id) => ({ id, resultants, kind: 'state' })),
    triangles: [
      { a: 0, b: 2, c: 4 }, { a: 0, b: 4, c: 3 },
      { a: 0, b: 3, c: 5 }, { a: 0, b: 5, c: 2 },
      { a: 1, b: 4, c: 2 }, { a: 1, b: 3, c: 4 },
      { a: 1, b: 5, c: 3 }, { a: 1, b: 2, c: 5 }
    ],
    directions: [],
    stations: [],
    normalization: { P: 1, Mx: 1, My: 1 },
    maxDirectionalInterpolationError: 0,
    maxStationInterpolationError: 0,
    directionRefinementConverged: true,
    stationRefinementConverged: true,
    topology: { closed: true, boundaryEdges: 0, nonManifoldEdges: 0, degenerateTriangles: 0 }
  }
  assert.equal(evaluateSurfaceTopology(surface.points, surface.triangles).closed, true)
  const intersection = intersectCapacitySurfaceWithRay(surface, { P: 0.2, Mx: 0.1, My: 0.1 })
  assert.ok(intersection)
  close(intersection.loadFactor, 2.5, 1e-12)
})

test('a clipped side triangle is not misclassified as an axial-cap face', () => {
  const surface: CapacitySurface = {
    points: [
      { id: 0, resultants: { P: 1, Mx: 0, My: 0 }, kind: 'axial-cap' },
      {
        id: 1,
        resultants: { P: 0, Mx: 1, My: 0 },
        kind: 'state',
        state: { neutralAxisAngle: 0, neutralAxisDepth: 1 }
      },
      {
        id: 2,
        resultants: { P: 0, Mx: 0, My: 1 },
        kind: 'state',
        state: { neutralAxisAngle: Math.PI / 2, neutralAxisDepth: 2 }
      }
    ],
    triangles: [{ a: 0, b: 1, c: 2 }],
    directions: [],
    stations: [],
    normalization: { P: 1, Mx: 1, My: 1 },
    maxDirectionalInterpolationError: 0,
    maxStationInterpolationError: 0,
    directionRefinementConverged: true,
    stationRefinementConverged: true,
    topology: { closed: false, boundaryEdges: 3, nonManifoldEdges: 0, degenerateTriangles: 0 },
    axialCap: 1
  }
  const solved = solveProportionalRayCapacity(surface, { P: 0.2, Mx: 0.2, My: 0.2 })
  assert.equal(solved.status, 'mesh-fallback')
  close(solved.loadFactor!, 5 / 3, 1e-12)
  assert.ok(solved.state)
})

test('proportional inverse refines a meshed seed back to the forward solution', () => {
  const fixture = createFixture()
  const surface = buildCapacitySurface(fixture.prepared, fixture.evaluator, {
    extremeCompressionStrain: fixture.law.extremeCompressionStrain,
    tensionPole: fixture.tensionPole,
    compressionPole: fixture.compressionPole,
    seedDirections: 24,
    maxRefinementPasses: 0
  })
  const known = fixture.evaluator({ neutralAxisAngle: 0.43, neutralAxisDepth: 240 })
  const expectedFactor = 1.7
  const demand = {
    P: known.resultants.P / expectedFactor,
    Mx: known.resultants.Mx / expectedFactor,
    My: known.resultants.My / expectedFactor
  }
  const result = solveProportionalRayCapacity(surface, demand, fixture.evaluator)
  assert.equal(result.status, 'converged')
  close(result.loadFactor!, expectedFactor, 1e-6)
  assert.ok(result.residualNorm! < 1e-8)
})

test('a failed exact refinement is a coherent mesh fallback, never a converged state', () => {
  const fixture = createFixture()
  const surface = buildCapacitySurface(fixture.prepared, fixture.evaluator, {
    extremeCompressionStrain: fixture.law.extremeCompressionStrain,
    tensionPole: fixture.tensionPole,
    compressionPole: fixture.compressionPole,
    seedDirections: 12,
    maxRefinementPasses: 0
  })
  const known = fixture.evaluator({ neutralAxisAngle: 0.431, neutralAxisDepth: 237 })
  const demand = {
    P: known.resultants.P / 1.7,
    Mx: known.resultants.Mx / 1.7,
    My: known.resultants.My / 1.7
  }
  const result = solveProportionalRayCapacity(surface, demand, fixture.evaluator, {
    maxIterations: 1,
    residualTolerance: 1e-16
  })
  assert.equal(result.status, 'mesh-fallback')
  assert.ok(result.refinement)
  assert.equal(result.state, undefined)
  assert.ok(result.residualNorm! > 1e-16)
  close(result.refinement!.residual.P, result.refinement!.capacity.P - result.refinement!.loadFactor * demand.P)
  close(result.refinement!.residual.Mx, result.refinement!.capacity.Mx - result.refinement!.loadFactor * demand.Mx)
  close(result.refinement!.residual.My, result.refinement!.capacity.My - result.refinement!.loadFactor * demand.My)
})

test('fixed-axial inverse recovers a known biaxial boundary point', () => {
  const fixture = createFixture()
  const known = fixture.evaluator({ neutralAxisAngle: 0.37, neutralAxisDepth: 250 })
  const result = solveFixedAxialCapacity(
    fixture.prepared,
    fixture.evaluator,
    known.resultants.P,
    { Mx: known.resultants.Mx, My: known.resultants.My },
    {
      angleSamples: 48,
      depthSamples: 72,
      extremeCompressionStrain: fixture.law.extremeCompressionStrain
    }
  )
  assert.notEqual(result.status, 'no-capacity')
  close(result.capacityFactor!, 1, 2e-5)
  close(result.axialResidual!, 0, 1e-6)
  assert.ok(Math.abs(result.directionResidual!) < 1e-4 * Math.hypot(known.resultants.Mx, known.resultants.My) ** 2)
})
