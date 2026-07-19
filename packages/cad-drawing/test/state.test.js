const test = require('ava')
const {
  createDefaultCadViewerState,
  createDrawingPlugin,
  createDrawingPipeline,
  flattenDrawingPlugins,
  normalizeSelectionState,
  setSelectedEntities
} = require('../src')

test('default viewer state can be specialized by host app', (t) => {
  const viewer = createDefaultCadViewerState({
    viewMode: 'xz',
    drawing: {
      mode: 'plate',
      snapEnabled: false
    },
    results: {
      mode: 'stressSx'
    }
  })

  t.is(viewer.camera.viewMode, 'xz')
  t.is(viewer.navigation.mode, 'select')
  t.is(viewer.drawing.mode, 'plate')
  t.is(viewer.drawing.snapEnabled, false)
  t.is(viewer.results.mode, 'stressSx')
})

test('plugin registry flattens tools overlays results and menus', (t) => {
  const frame = createDrawingPlugin({
    id: 'frame',
    entityLayers: [{ id: 'frame-entities', entityKinds: ['node', 'element'] }],
    attachmentLayers: [{ id: 'frame-loads', attachmentKinds: ['load'], targetEntityKinds: ['element'] }],
    tools: [{ id: 'node' }],
    resultLayers: [{ id: 'momentMz', family: 'moment' }]
  })
  const plate = createDrawingPlugin({
    id: 'plate',
    entityLayers: [{ id: 'plate-entities', entityKinds: ['plate'] }],
    tools: [{ id: 'plate' }],
    toolbarMenus: [{ id: 'mesh' }]
  })

  const registry = flattenDrawingPlugins([frame, plate])
  t.deepEqual(registry.entityLayers.map((x) => x.id), ['frame-entities', 'plate-entities'])
  t.deepEqual(registry.attachmentLayers.map((x) => x.id), ['frame-loads'])
  t.deepEqual(registry.tools.map((x) => x.id), ['node', 'plate'])
  t.deepEqual(registry.resultLayers.map((x) => x.id), ['momentMz'])
  t.deepEqual(registry.toolbarMenus.map((x) => x.id), ['mesh'])
})

test('selection supports legacy node/element ids and future entity refs', (t) => {
  const normalized = normalizeSelectionState({
    selectedNodeIds: [1],
    selectedElementIds: [2],
    selectedEntities: [
      { kind: 'plate', id: 'p1' },
      { kind: 'solid', id: 's1' }
    ]
  })

  t.deepEqual(normalized.selectedNodeIds, [1])
  t.deepEqual(normalized.selectedElementIds, [2])
  t.deepEqual(normalized.selectedEntities.map((x) => `${x.kind}:${x.id}`), [
    'node:1',
    'element:2',
    'plate:p1',
    'solid:s1'
  ])
})

test('drawing pipeline keeps entities attachments overlays results separate', (t) => {
  const pipeline = createDrawingPipeline([
    {
      entityLayers: [{ id: 'entities', entityKinds: ['node', 'plate'] }],
      attachmentLayers: [{ id: 'attachments', attachmentKinds: ['load'] }],
      overlayLayers: [{ id: 'preview' }],
      resultLayers: [{ id: 'stressSx', family: 'stress' }],
      tools: [{ id: 'plate' }]
    }
  ])

  t.deepEqual(Object.keys(pipeline), [
    'entityLayers',
    'attachmentLayers',
    'overlayLayers',
    'resultLayers',
    'tools',
    'toolbarMenus',
    'selectionPanels'
  ])
  t.is(pipeline.entityLayers[0].id, 'entities')
  t.is(pipeline.attachmentLayers[0].id, 'attachments')
  t.is(pipeline.resultLayers[0].family, 'stress')
})

test('setSelectedEntities updates generic and legacy selection fields', (t) => {
  const state = { viewer: createDefaultCadViewerState() }
  const patch = setSelectedEntities(state, [
    { kind: 'node', id: 3 },
    { kind: 'element', id: 7 },
    { kind: 'plate', id: 'P2' }
  ])

  t.deepEqual(patch.viewer.selection.selectedNodeIds, [3])
  t.deepEqual(patch.viewer.selection.selectedElementIds, [7])
  t.deepEqual(patch.viewer.selection.selectedEntities.map((x) => `${x.kind}:${x.id}`), [
    'node:3',
    'element:7',
    'plate:P2'
  ])
})
