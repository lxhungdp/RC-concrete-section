import assert from 'node:assert/strict'
import type { PreviewSurfaceDataset } from '@pm/analysis'

type ContourDataset = {
  points: ReadonlyArray<Pick<PreviewSurfaceDataset['points'][number], 'P' | 'Mx' | 'My'>>
  triangles?: PreviewSurfaceDataset['triangles']
}

/** Independent 2D line/segment query on each triangle's P-plane cut; no polar-sorted polygon. */
export const segmentContourRadius = (dataset: ContourDataset,
  P: number, theta: number): number | null => {
  assert.ok(dataset.triangles, 'The verification oracle requires explicit triangle connectivity.')
  const cosine = Math.cos(theta)
  const sine = Math.sin(theta)
  let radius = Number.POSITIVE_INFINITY
  for (const { a, b, c } of dataset.triangles) {
    const vertices = [dataset.points[a], dataset.points[b], dataset.points[c]]
    const cut: Array<{ Mx: number; My: number }> = []
    for (let edge = 0; edge < 3; edge += 1) {
      const first = vertices[edge]
      const second = vertices[(edge + 1) % 3]
      if (first.P === P) cut.push(first)
      if ((first.P < P && second.P > P) || (first.P > P && second.P < P)) {
        const fraction = (P - first.P) / (second.P - first.P)
        cut.push({ Mx: first.Mx + fraction * (second.Mx - first.Mx),
          My: first.My + fraction * (second.My - first.My) })
      }
    }
    for (let left = 0; left < cut.length; left += 1) for (let right = left + 1; right < cut.length; right += 1) {
      const first = cut[left]
      const second = cut[right]
      const normalFirst = first.My * cosine - first.Mx * sine
      const normalSecond = second.My * cosine - second.Mx * sine
      if (normalFirst * normalSecond > 0 || normalFirst === normalSecond) continue
      const fraction = normalFirst / (normalFirst - normalSecond)
      const Mx = first.Mx + fraction * (second.Mx - first.Mx)
      const My = first.My + fraction * (second.My - first.My)
      const along = Mx * cosine + My * sine
      if (along > 0) radius = Math.min(radius, along)
    }
  }
  return Number.isFinite(radius) ? radius : null
}

/** Analytical box oracle: plane P=0 cuts the box into [-4,4] x [-6,6]. */
export const verifySegmentOracle = () => {
  const points = [-2, 2].flatMap(P => [[-4, -6], [4, -6], [4, 6], [-4, 6]].map(([Mx, My]) =>
    ({ P, Mx, My })))
  const triangles = [[0, 1, 2], [0, 2, 3], [4, 6, 5], [4, 7, 6], [0, 4, 5], [0, 5, 1],
    [1, 5, 6], [1, 6, 2], [2, 6, 7], [2, 7, 3], [3, 7, 4], [3, 4, 0]].map(([a, b, c]) => ({ a, b, c }))
  for (let octant = 0; octant < 8; octant += 1) {
    const theta = (octant + 0.37) * Math.PI / 4
    const expected = Math.min(4 / Math.abs(Math.cos(theta)), 6 / Math.abs(Math.sin(theta)))
    const actual = segmentContourRadius({ points, triangles }, 0, theta)
    assert.ok(actual !== null && Math.abs(actual - expected) < 1e-12, `${actual} versus ${expected}`)
  }
}
