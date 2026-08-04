/**
 * Direction sampling is measured, and refinement reduces what it measures (`docs/05` section 5,
 * `docs/06` section 5). Production starts with 36 directions and adaptively probes all 25 stations;
 * fixed grids remain explicit user/benchmark choices.
 */
import { strict as assert } from 'node:assert'
import test from 'node:test'
import { geometryInputRebars, sectionGeometryFromGeometryInput } from '@pm/geometry'
import { createDefaultAnalysisOptions, type AnalysisOptions } from '@pm/project'
import {
  buildPreviewSurfaceFromPrepared,
  intersectFixedPContourWithMomentRay,
  prepareAnalysis,
  sliceFixedPContour
} from './index'
import { referenceProjectDocument } from './reference-case'

const document = referenceProjectDocument()
const prepared = prepareAnalysis(
  sectionGeometryFromGeometryInput(document.inputs.geometry),
  geometryInputRebars(document.inputs.geometry),
  document.inputs.materials
)

const optionsWithRefinement = (
  refinement: AnalysisOptions['directions']['refinement']
): AnalysisOptions => {
  const options = createDefaultAnalysisOptions()
  options.directions.refinement = refinement
  return options
}

test('the default starts from 36 directions and adaptively meets the angular error target', () => {
  const surface = buildPreviewSurfaceFromPrepared(prepared)
  assert.ok(surface.directionError.directions >= 36)
  assert.ok(surface.directionError.refinementPasses > 0)
  assert.ok(surface.directionError.maxRelativeMoment > 0)
  assert.ok(Number.isFinite(surface.directionError.maxRelativeMoment))
  assert.ok(surface.directionError.maxRelativeMoment <= 0.005)
  assert.equal(surface.points.length, surface.directionError.directions * 25)
})

test('switching the probe off costs nothing and reports unknown, never zero', () => {
  const surface = buildPreviewSurfaceFromPrepared(
    prepared,
    optionsWithRefinement({ type: 'fixed', probe: { stationIds: [] } })
  )
  assert.equal(surface.directionError.directions, 36)
  assert.ok(Number.isNaN(surface.directionError.maxRelativeMoment), 'an untaken estimate must not read as 0')
  assert.ok(Number.isNaN(surface.directionError.maxRelativeP))
  // The capacity itself is unaffected by whether the estimate was taken.
  const withProbe = buildPreviewSurfaceFromPrepared(
    prepared,
    optionsWithRefinement({ type: 'fixed', probe: 'all' })
  )
  assert.deepEqual(
    surface.points.map((point) => point.P),
    withProbe.points.map((point) => point.P)
  )
})

test('refinement adds directions and lowers the measured error', () => {
  const coarse = buildPreviewSurfaceFromPrepared(
    prepared,
    optionsWithRefinement({ type: 'fixed', probe: 'all' })
  )
  const fine = buildPreviewSurfaceFromPrepared(
    prepared,
    optionsWithRefinement({
      type: 'adaptive',
      tolerance: 5e-3,
      maxPasses: 3,
      maxDirections: 192,
      probe: { stationIds: [5, 10, 14, 16] }
    })
  )

  assert.ok(fine.directionError.directions > coarse.directionError.directions)
  assert.ok(fine.directionError.refinementPasses > 0)
  assert.ok(
    fine.directionError.maxRelativeMoment < coarse.directionError.maxRelativeMoment,
    `${fine.directionError.maxRelativeMoment} should be below ${coarse.directionError.maxRelativeMoment}`
  )
  // Every direction still carries the full station schedule.
  assert.equal(fine.points.length, fine.directionError.directions * 25)
  const perDirection = new Map<number, number>()
  for (const point of fine.points) perDirection.set(point.beta, (perDirection.get(point.beta) ?? 0) + 1)
  assert.ok([...perDirection.values()].every((count) => count === 25))
})

test('the direction cap is respected and reported as not converged', () => {
  const capped = buildPreviewSurfaceFromPrepared(
    prepared,
    optionsWithRefinement({
      type: 'adaptive',
      tolerance: 1e-9,
      maxPasses: 10,
      maxDirections: 60,
      probe: { stationIds: [5, 10, 14, 16] }
    })
  )
  assert.ok(capped.directionError.directions <= 60)
  assert.equal(capped.directionError.withinTolerance, false)
  assert.ok(
    capped.warnings.some((warning) => warning.startsWith('Direction sampling did not reach')),
    'a surface that missed its tolerance must say so'
  )
})

test('the coarse grid under-estimates capacity, so refinement may only raise it', () => {
  const P = 24942.922102452183e3
  const theta = Math.atan2(1431.7807276950741e6, 3714.165943842699e6)
  const capacity = (surface: ReturnType<typeof buildPreviewSurfaceFromPrepared>) =>
    intersectFixedPContourWithMomentRay(sliceFixedPContour(surface.points, P), theta)?.M ?? Number.NaN

  const coarse = capacity(buildPreviewSurfaceFromPrepared(
    prepared,
    optionsWithRefinement({ type: 'fixed', probe: 'all' })
  ))
  const fine = capacity(
    buildPreviewSurfaceFromPrepared(
      prepared,
      optionsWithRefinement({
        type: 'adaptive',
        tolerance: 2e-3,
        maxPasses: 3,
        maxDirections: 192,
        probe: { stationIds: [5, 10, 14, 16] }
      })
    )
  )

  assert.ok(Number.isFinite(coarse) && Number.isFinite(fine))
  // Chord interpolation across a convex contour cuts the corner, so the seed polygon is conservative.
  assert.ok(fine >= coarse * (1 - 1e-9), `refined capacity ${fine} fell below coarse ${coarse}`)
})
