import assert from 'node:assert/strict'
import test from 'node:test'
import {
  sliceFixedPContour,
  sliceMomentPlane,
  type PreviewSurfacePoint,
  type ResultantLedger
} from '../src/index'

const zeroLedger: ResultantLedger = {
  concrete: { P: 0, Mx: 0, My: 0 },
  steelGross: { P: 0, Mx: 0, My: 0 },
  displacedConcrete: { P: 0, Mx: 0, My: 0 },
  steel: { P: 0, Mx: 0, My: 0 },
  total: { P: 0, Mx: 0, My: 0 }
}

test('surface slicing accepts the largest configured adaptive point count without argument overflow', () => {
  // Analysis Options permits 198 stations x 720 directions. Passing this array through
  // Math.max(...points) throws RangeError in common JS engines before any geometry is evaluated.
  const points: PreviewSurfacePoint[] = Array.from({ length: 198 * 720 }, (_, index) => ({
    id: `resource-limit-${index}`,
    beta: 0,
    station: index,
    stationId: null,
    surfaceRole: 'physical-state',
    P: index % 100,
    Mx: index % 17,
    My: -(index % 23),
    state: { e0: 0, kx: 0, ky: 0 },
    ledger: zeroLedger
  }))

  assert.deepEqual(sliceFixedPContour(points, 0, []), [])
  assert.deepEqual(sliceMomentPlane(points, 0, []), [])
})
