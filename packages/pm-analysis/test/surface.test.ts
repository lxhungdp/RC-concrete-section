/**
 * Fixed-P is the horizontal intersection of the independent fixed 22 × 36 surface. Sampled
 * meridian crossings are labelled markers; diagonal/cross-beta crossings remain polygon vertices.
 */
import { strict as assert } from 'node:assert'
import test from 'node:test'
import { geometryInputRebars, sectionGeometryFromGeometryInput } from '@pm/geometry'
import { createDefaultAnalysisOptions } from '@pm/project'
import { buildPreviewSurface, contourStrainAngleSamples, sliceFixedPContour } from '../src/index'
import { referenceProjectDocument } from './fixtures/reference-case'

const KN = 1e3
const document = referenceProjectDocument()
const section = sectionGeometryFromGeometryInput(document.inputs.geometry)
const rebars = geometryInputRebars(document.inputs.geometry)
const fixedSampling = (() => {
  const options = createDefaultAnalysisOptions()
  options.stations.refinement = { type: 'fixed' }
  options.directions.refinement = { type: 'fixed', probe: 'all' }
  return options
})()
const surface = buildPreviewSurface(section, rebars, document.inputs.materials, undefined, fixedSampling)
const SAMPLED_DIRECTIONS = surface.directions.length

const levels = [24942.9 * KN, 10000 * KN, 0, -3000 * KN]

test('the surface no longer carries an unused precomputed contour', () => {
  assert.equal('contour' in surface, false)
})

test('the fixed-P surface retains exactly the 36 fixed directions', () => {
  assert.equal(SAMPLED_DIRECTIONS, 36)
  assert.equal(new Set(surface.points.map((point) => point.beta)).size, SAMPLED_DIRECTIONS)
})

test('the fixed-P polygon retains intermediate triangle-edge vertices', () => {
  const contour = sliceFixedPContour(surface.points, 0, surface.triangles)
  assert.ok(contour.length > SAMPLED_DIRECTIONS)
  assert.ok(contour.some((point) => !point.onSampledDirection))
})

for (const fixedP of levels) {
  const label = `P = ${(fixedP / KN).toFixed(0)} kN`

  test(`${label}: every sampled direction appears exactly once`, () => {
    const contour = sliceFixedPContour(surface.points, fixedP)
    const samples = contourStrainAngleSamples(contour)
    const betas = samples.map((point) => point.beta)

    assert.equal(new Set(betas).size, betas.length, 'a direction was reported twice')
    assert.equal(samples.length, SAMPLED_DIRECTIONS, `got ${samples.length} of ${SAMPLED_DIRECTIONS} directions`)
    assert.deepEqual([...betas].sort((a, b) => a - b), betas, 'samples must come back in ascending beta')
  })

  test(`${label}: the meridian markers are members of the drawn triangle-cut contour`, () => {
    const contour = sliceFixedPContour(surface.points, fixedP)
    for (const sample of contourStrainAngleSamples(contour)) {
      assert.ok(contour.includes(sample), 'a marker was not an element of the contour it is drawn on')
    }
  })

  test(`${label}: the contour sits on the requested axial level`, () => {
    for (const point of sliceFixedPContour(surface.points, fixedP)) assert.equal(point.P, fixedP)
  })
}
