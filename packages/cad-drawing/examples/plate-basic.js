const { createDrawingPlugin } = require('../src')

const plateBasicModel = {
  vertices: [
    { id: 1, x: 0, y: 0, z: 0 },
    { id: 2, x: 10, y: 0, z: 0 },
    { id: 3, x: 10, y: 8, z: 0 },
    { id: 4, x: 0, y: 8, z: 0 }
  ],
  plates: [
    { id: 1, vertices: [1, 2, 3, 4], thickness: 0.2 }
  ]
}

const plateDrawingPlugin = createDrawingPlugin({
  id: 'plate-basic',
  label: 'Plate Basic',
  entityLayers: [
    {
      id: 'plate-vertices-faces',
      label: 'Plate Vertices and Faces',
      entityKinds: ['node', 'plate'],
      getEntities: (model) => [
        ...(model.vertices || []).map((node) => ({ kind: 'node', id: node.id, data: node })),
        ...(model.plates || []).map((plate) => ({ kind: 'plate', id: plate.id, data: plate }))
      ]
    }
  ],
  attachmentLayers: [
    {
      id: 'plate-loads-boundaries',
      label: 'Plate Loads and Boundaries',
      attachmentKinds: ['load', 'restraint', 'rigid'],
      targetEntityKinds: ['node', 'plate']
    }
  ],
  tools: [
    { id: 'plate', label: 'Plate' },
    { id: 'mesh-seed', label: 'Mesh Seed' }
  ],
  resultLayers: [
    { id: 'stressSx', label: 'Sx', family: 'stress', entityKinds: ['plate'] },
    { id: 'plateMomentMx', label: 'Mx', family: 'moment', entityKinds: ['plate'] }
  ]
})

module.exports = { plateBasicModel, plateDrawingPlugin }
