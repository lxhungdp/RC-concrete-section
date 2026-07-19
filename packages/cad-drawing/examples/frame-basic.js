const { createDrawingPlugin } = require('../src')

const frameBasicModel = {
  nodes: [
    { id: 1, x: 0, y: 0, z: 0 },
    { id: 2, x: 10, y: 0, z: 0 },
    { id: 3, x: 20, y: 0, z: 0 }
  ],
  elements: [
    { id: 1, iNode: 1, jNode: 2 },
    { id: 2, iNode: 2, jNode: 3 }
  ]
}

const frameDrawingPlugin = createDrawingPlugin({
  id: 'frame-basic',
  label: 'Frame Basic',
  entityLayers: [
    {
      id: 'frame-nodes-elements',
      label: 'Frame Nodes and Elements',
      entityKinds: ['node', 'element'],
      getEntities: (model) => [
        ...(model.nodes || []).map((node) => ({ kind: 'node', id: node.id, data: node })),
        ...(model.elements || []).map((element) => ({ kind: 'element', id: element.id, data: element }))
      ]
    }
  ],
  attachmentLayers: [
    {
      id: 'frame-boundaries-loads',
      label: 'Frame Loads, Restraints, Releases',
      attachmentKinds: ['load', 'restraint', 'release', 'rigid'],
      targetEntityKinds: ['node', 'element']
    }
  ],
  tools: [
    { id: 'node', label: 'Node' },
    { id: 'element', label: 'Element' }
  ],
  resultLayers: [
    { id: 'displacement', label: 'U', family: 'displacement', entityKinds: ['node'] },
    { id: 'axial', label: 'N', family: 'force', entityKinds: ['element'] },
    { id: 'momentMz', label: 'Mz', family: 'moment', entityKinds: ['element'] }
  ]
})

module.exports = { frameBasicModel, frameDrawingPlugin }
