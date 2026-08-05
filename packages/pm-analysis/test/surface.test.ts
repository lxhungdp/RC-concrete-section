/**
 * One fixed-P contour, one source of truth.
 *
 * `sliceFixedP` used to produce a second, separately interpolated 24-gon that the UI drew as markers
 * on top of the triangle-cut contour, and that `PreviewSurface.contour` carried through every worker
 * message without any consumer. The two disagreed by up to ~1% of capacity.
 */
import { strict as assert } from 'node:assert'
import test from 'node:test'
import { geometryInputRebars, sectionGeometryFromGeometryInput } from '@pm/geometry'
import { buildPreviewSurface, contourStrainAngleSamples, sliceFixedPContour } from '../src/index'
import { referenceProjectDocument } from './fixtures/reference-case'

const KN = 1e3
const document = referenceProjectDocument()
const section = sectionGeometryFromGeometryInput(document.inputs.geometry)
const rebars = geometryInputRebars(document.inputs.geometry)
const surface = buildPreviewSurface(section, rebars, document.inputs.materials)
const SAMPLED_DIRECTIONS = surface.directions.length

const levels = [24942.9 * KN, 10000 * KN, 0, -3000 * KN]

test('the surface no longer carries an unused precomputed contour', () => {
  assert.equal('contour' in surface, false)
})

test('the surface retains at least the 36 seed directions after adaptive refinement', () => {
  assert.ok(SAMPLED_DIRECTIONS >= 36)
  assert.equal(new Set(surface.points.map((point) => point.beta)).size, SAMPLED_DIRECTIONS)
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

  test(`${label}: the markers are members of the drawn contour, not a parallel computation`, () => {
    const contour = sliceFixedPContour(surface.points, fixedP)
    for (const sample of contourStrainAngleSamples(contour)) {
      assert.ok(contour.includes(sample), 'a marker was not an element of the contour it is drawn on')
    }
  })

  test(`${label}: the contour sits on the requested axial level`, () => {
    for (const point of sliceFixedPContour(surface.points, fixedP)) assert.equal(point.P, fixedP)
  })
}
