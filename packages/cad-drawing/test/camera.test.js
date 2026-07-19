const test = require('ava')
const {
  CAD_2D_AXES,
  boundsFromPoints,
  collectNodeFitPoints,
  createDefaultCadViewerState
} = require('../src')

test('cad 2d axes define the reusable XY XZ YZ planes', (t) => {
  t.deepEqual(CAD_2D_AXES.xy.coords, [0, 1])
  t.deepEqual(CAD_2D_AXES.xz.coords, [0, 2])
  t.deepEqual(CAD_2D_AXES.yz.coords, [1, 2])
})

test('zoom-fit point collection is node-based and project agnostic', (t) => {
  const points = collectNodeFitPoints({
    nodes: [
      { id: 1, x: 0, y: 0, z: 0 },
      { id: 2, x: 10, y: 5, z: -2 }
    ],
    elements: [{ id: 1, iNode: 1, jNode: 2 }]
  })
  const bounds = boundsFromPoints(points)
  t.deepEqual(bounds.min, [0, 0, -2])
  t.deepEqual(bounds.max, [10, 5, 0])
  t.deepEqual(bounds.center, [5, 2.5, -1])

  const viewer = createDefaultCadViewerState({ viewMode: '3d' })
  t.is(viewer.camera.orbitPivot, 'structure')
})
