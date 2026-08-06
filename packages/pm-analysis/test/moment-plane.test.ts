import { strict as assert } from 'node:assert'
import test from 'node:test'
import { geometryInputRebars, sectionGeometryFromGeometryInput } from '@pm/geometry'
import { createDefaultAnalysisOptions } from '@pm/project'
import { BENCH_CASES } from '../bench/sections'
import { buildPreviewSurface, sliceMomentPlane, type PreviewSurface } from '../src/index'

const ANGLES_DEG = [0, 7, 17, 31, 45, 61, 83, 107, 137, 173]
const fixedDisplayOptions = (() => {
  const options = createDefaultAnalysisOptions()
  options.stations.refinement = { type: 'fixed' }
  options.directions.refinement = { type: 'fixed', probe: 'all' }
  return options
})()

const surfaces = BENCH_CASES.map((benchCase) => ({
  benchCase,
  surface: buildPreviewSurface(
    sectionGeometryFromGeometryInput(benchCase.geometry),
    geometryInputRebars(benchCase.geometry),
    benchCase.materials,
    undefined,
    fixedDisplayOptions
  )
}))

const assertDirectionIndependentPole = (surface: PreviewSurface, station: number) => {
  const ring = surface.points.filter((point) => point.station === station)
  assert.ok(ring.length > 1)
  for (const point of ring.slice(1)) {
    assert.equal(point.P, ring[0].P)
    assert.equal(point.Mx, ring[0].Mx)
    assert.equal(point.My, ring[0].My)
  }
}

test('pure compression and tension are direction-independent surface vertices', () => {
  for (const { surface } of surfaces) {
    assertDirectionIndependentPole(surface, 0)
    assertDirectionIndependentPole(surface, surface.stations.length - 1)
  }
})

test('8 structural fixtures × 10 moment planes produce only topology-closed paths', () => {
  for (const { benchCase, surface } of surfaces) {
    const momentScale = Math.max(...surface.points.map((point) => Math.hypot(point.Mx, point.My)), 1)
    const forceScale = Math.max(...surface.points.map((point) => Math.abs(point.P)), 1)

    for (const degrees of ANGLES_DEG) {
      const theta = (degrees * Math.PI) / 180
      const paths = sliceMomentPlane(surface.points, theta)
      assert.ok(paths.length > 0, `${benchCase.key} ${degrees}° has no section path`)

      for (const [pathIndex, path] of paths.entries()) {
        const label = `${benchCase.key} ${degrees}° path ${pathIndex}`
        assert.equal(path.closed, true, `${label} is open`)
        assert.ok(path.points.length >= 4, `${label} has fewer than three edges`)
        assert.deepEqual(path.points[path.points.length - 1], path.points[0], `${label} was not closed by topology`)

        for (const point of path.points) {
          const offPlane = Math.abs(point.Mx * Math.sin(theta) - point.My * Math.cos(theta))
          assert.ok(offPlane <= momentScale * 2e-12, `${label} leaves the requested plane by ${offPlane}`)
        }
        for (let index = 0; index < path.points.length - 1; index++) {
          const a = path.points[index]
          const b = path.points[index + 1]
          const normalizedLength = Math.hypot((b.P - a.P) / forceScale, (b.M - a.M) / momentScale)
          assert.ok(normalizedLength > 1e-12, `${label} contains a collapsed display edge`)
        }
      }
    }
  }
})

test('an asymmetric section can have nonzero pole moment without opening its vertical slice', () => {
  const { surface } = surfaces.find(({ benchCase }) => benchCase.key === 'tall-rectangle-dense')!
  const compressionPole = surface.points.find((point) => point.station === 0)!
  const tensionPole = surface.points.find((point) => point.station === surface.stations.length - 1)!
  assert.ok(Math.hypot(compressionPole.Mx, compressionPole.My) > 1e6)
  assert.ok(Math.hypot(tensionPole.Mx, tensionPole.My) > 1e6)

  const theta = (83 * Math.PI) / 180
  const paths = sliceMomentPlane(surface.points, theta)
  assert.ok(paths.every((path) => path.closed))
  assert.ok(
    paths.flatMap((path) => path.points).every((point) => point.P !== compressionPole.P),
    'an off-plane pure-compression vertex must not be forced into the section'
  )
})
