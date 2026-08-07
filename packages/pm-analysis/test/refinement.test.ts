/**
 * Direction sampling is measured, and refinement reduces what it measures (`docs/05` section 5,
 * `docs/06` section 5). Production uses the fixed 27-by-36 grid; adaptive sampling remains an
 * explicit audit/benchmark choice.
 */
import { strict as assert } from 'node:assert'
import test from 'node:test'
import { geometryInputRebars, sectionGeometryFromGeometryInput } from '@pm/geometry'
import {
  ADAPTIVE_INITIAL_STATION_COUNT,
  createAdaptiveAnalysisOptions,
  createDefaultAnalysisOptions,
  UNIFIED_STATION_COUNT,
  type AnalysisOptions
} from '@pm/project'
import {
  buildPreviewSurfaceFromPrepared,
  intersectFixedPContourWithMomentRay,
  prepareAnalysis,
  sliceFixedPContour
} from '../src/index'
import { referenceProjectDocument } from './fixtures/reference-case'

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

const adaptiveOptions = (directionPasses: number, maxDirections: number, tolerance = 7.5e-3) => {
  const options = createAdaptiveAnalysisOptions()
  if (options.stations.refinement.type !== 'adaptive' || options.directions.refinement.type !== 'adaptive') {
    throw new Error('Adaptive preset is invalid.')
  }
  options.stations.refinement.maxPasses = 2
  options.stations.refinement.maxStations = 30
  options.directions.refinement.tolerance = tolerance
  options.directions.refinement.maxPasses = directionPasses
  options.directions.refinement.maxDirections = maxDirections
  return options
}

test('the default fixed grid performs no station or direction probes', () => {
  const surface = buildPreviewSurfaceFromPrepared(prepared)
  assert.equal(surface.stations.length, UNIFIED_STATION_COUNT)
  assert.equal(surface.directionError.directions, 36)
  assert.equal(surface.directionError.refinementPasses, 0)
  assert.equal(surface.stationError.refinementPasses, 0)
  assert.ok(Number.isNaN(surface.directionError.maxRelativeMoment))
  assert.ok(Number.isNaN(surface.stationError.maxRelative))
  assert.deepEqual(surface.directionError.probedStations, [])
  assert.equal(surface.points.length, surface.directionError.directions * surface.stations.length)
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
  const coarse = buildPreviewSurfaceFromPrepared(prepared, adaptiveOptions(0, 12))
  const fine = buildPreviewSurfaceFromPrepared(prepared, adaptiveOptions(2, 48))

  assert.ok(fine.directionError.directions > coarse.directionError.directions)
  assert.ok(fine.directionError.refinementPasses > 0)
  assert.ok(
    fine.directionError.maxRelativeMoment < coarse.directionError.maxRelativeMoment,
    `${fine.directionError.maxRelativeMoment} should be below ${coarse.directionError.maxRelativeMoment}`
  )
  const perDirection = new Map<number, number>()
  for (const point of fine.points) perDirection.set(point.beta, (perDirection.get(point.beta) ?? 0) + 1)
  assert.ok([...perDirection.values()].every((count) => count >= ADAPTIVE_INITIAL_STATION_COUNT))
  assert.ok(new Set(perDirection.values()).size > 1, 'independent meridians should be allowed to retain different station counts')
  assert.ok((fine.triangles?.length ?? 0) > fine.points.length, 'adaptive surface must carry explicit topology')
})

test('the direction cap is respected and reported as not converged', () => {
  const capped = buildPreviewSurfaceFromPrepared(
    prepared,
    adaptiveOptions(10, 60, 1e-9)
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
    intersectFixedPContourWithMomentRay(sliceFixedPContour(surface.points, P, surface.triangles), theta)?.M ?? Number.NaN

  const coarse = capacity(buildPreviewSurfaceFromPrepared(
    prepared,
    createDefaultAnalysisOptions()
  ))
  const fine = capacity(
    buildPreviewSurfaceFromPrepared(
      prepared,
      adaptiveOptions(2, 48, 2e-3)
    )
  )

  assert.ok(Number.isFinite(coarse) && Number.isFinite(fine))
  // Chord interpolation across a convex contour cuts the corner, so the seed polygon is conservative.
  assert.ok(fine >= coarse * (1 - 1e-9), `refined capacity ${fine} fell below coarse ${coarse}`)
})
