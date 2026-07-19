# @structures/cad-drawing

Reusable CAD drawing shell for structural and engineering viewers.

This package intentionally owns only the drawing shell:

- camera state and CAD view modes: `3d`, `xy`, `xz`, `yz`
- orthographic 2D pan/zoom and perspective 3D zoom-to-fit
- navigation modes: select, pan, rotate
- cursor resolution
- default viewer state
- extension contracts for entity layers, attachment layers, tools, overlay layers, result layers, and toolbar menus
- shared theme tokens

It does not know what a frame member, plate, shell, support, release, or stress result is.
Those concepts belong to plugins such as a frame drawing adapter or a future plate/shell adapter.

## Pipeline

```text
domain model
  -> app/plugin adapter
  -> cad-drawing entity/attachment/result/tool layers
  -> camera + interaction shell
  -> WebGL/SVG render layers
  -> commands emitted back to the host app
```

The host app remains responsible for persistence, reducers, solver calls, import/export, and business rules.

## Typical Host Wiring

```js
const {
  createDefaultCadViewerState,
  resolveViewerCursor,
  setNavigationMode,
  applyViewMode,
  zoomToFitView
} = require('@structures/cad-drawing')

const viewer = createDefaultCadViewerState({
  viewMode: '3d',
  drawing: {
    mode: 'none',
    snapEnabled: true
  },
  results: {
    mode: null
  }
})
```

## Extension Contracts

Tools are project-specific drawing modes:

```js
{
  id: 'plate',
  label: 'Plate',
  cursor: 'crosshair',
  onPointerMove(context, event) {},
  onClick(context, event) {},
  renderPreview(context) {}
}
```

Overlay layers render project-specific graphics over the shared camera:

```js
{
  id: 'frame-loads',
  phase: 'model',
  render(context) {}
}
```

Entity layers expose id-bearing drawing objects:

```js
{
  id: 'frame-entities',
  entityKinds: ['node', 'element'],
  getEntities(model) {}
}
```

Attachment layers expose loads, restraints, releases, rigid links, and similar
objects attached to entities:

```js
{
  id: 'frame-attachments',
  attachmentKinds: ['load', 'restraint', 'release', 'rigid'],
  targetEntityKinds: ['node', 'element']
}
```

Result layers are the normalized display output from any solver:

```js
{
  id: 'plate-stress-sx',
  label: 'Sx',
  render(context) {}
}
```

Toolbar menus are shell slots, not hard-coded frame menus:

```js
{
  id: 'mesh',
  label: 'Mesh',
  icon,
  renderPanel(context) {}
}
```

## Examples

See `examples/frame-basic.js` and `examples/plate-basic.js`. They are deliberately small reference models so future complex shapes can start from a known, stable contract.

## Architecture Notes

See `docs/ARCHITECTURE.md` for the intended package boundaries and the staged
refactor plan from the current web drawing into reusable core + domain plugins.
