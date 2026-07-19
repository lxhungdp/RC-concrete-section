# CAD Drawing Architecture

This package is the reusable drawing shell. It should remain useful for frame,
plate, shell, mesh, or other engineering projects.

## Layer Boundaries

```text
host app
  Owns persistence, reducers, project state, solver calls, import/export.

domain plugin
  Owns project-specific entities, attachments, tools, result layers, and panels.
  Examples: frame members, plate faces, shell stress contours.

cad-drawing shell
  Owns camera, 2D/3D view modes, zoom, pan, rotate, selection state,
  cursor state, grid/origin/view-cube contracts, theme tokens, and registry
  contracts for plugins.
```

The shell emits commands. It does not mutate host state directly.

## Stable Pipeline

```text
model
  -> adapter/plugin normalizes entities
  -> entity layers expose id-bearing objects
  -> attachment layers expose loads/restraints/releases/rigids on entities
  -> result layers expose displacement/force/moment/stress output
  -> cad-drawing computes camera/navigation/selection state
  -> renderer draws core layers and registered plugin layers in pipeline order
  -> user interaction emits commands
  -> host app applies commands to project state
```

## Recommended Structural/CAD Decomposition

The package follows the same broad separation used by mature analysis/modeling
software: model entities, boundary/loading data, analysis results, and the
interactive viewport are separate concerns.

```text
cad-drawing shell
  Camera, grid, origin, view cube, zoom, pan, rotate, selection, cursor.

entity layers
  Id-bearing model objects. Current frame project uses node + element. Future
  projects can add plate, shell, solid, mesh cell, tendon, cable, etc.

attachment layers
  Objects attached to entities: load, restraint, release, rigid links, offsets,
  constraints, hinges, local-axis markers.

result layers
  Analysis/solver output: displacement, internal force, moment, reaction,
  stress, strain, utilization, contour, envelope, mode shape.

tools and menus
  Project-specific authoring UI. Frame tools can add nodes/elements. Plate tools
  can draw plates, openings, mesh seeds. The shell only provides the contract.
```

This is slightly more general than the initial frame-only split and maps better
to workflows in products such as Midas Civil, SAP2000, ETABS, Abaqus, or other
engineering modelers: the viewport is shared, while entities, boundary data, and
results are registered as domain layers.

## Core Concepts

### View Modes

- `3d`: perspective orbit camera, rotate allowed.
- `xy`: orthographic CAD plan view.
- `xz`: orthographic CAD front/elevation view.
- `yz`: orthographic CAD side view.

2D modes allow select and pan. Rotate is normalized to select in 2D.

### Zoom Fit

The shell currently exposes a node/point based zoom-fit utility. This matches
the frame workflow and is intentionally simple. Plate/shell plugins can either
provide nodes/vertices in the same shape, or later add a plugin-specific
`fitPoints()` adapter while keeping the same camera code.

### Drawing Tools

Drawing tools are plugin-owned. The shell does not hard-code `node`, `element`,
`plate`, or `mesh`.

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

### Entity Layers

Entities are the base selectable objects and must have stable ids.

```js
{
  id: 'plate-entities',
  entityKinds: ['node', 'plate'],
  getEntities(model) {
    return [
      { kind: 'node', id: 1, data: model.nodes[0] },
      { kind: 'plate', id: 'P1', data: model.plates[0] }
    ]
  },
  render(context) {},
  hitTest(context, pointer) {},
  getFitPoints(model) {}
}
```

Current built-in entity kind names are `node`, `element`, `plate`, and `solid`.
Plugins may still introduce additional kinds when needed.

### Attachment Layers

Attachments are not the main topology. They are objects placed on or between
entities.

```js
{
  id: 'frame-boundaries-loads',
  attachmentKinds: ['load', 'restraint', 'release', 'rigid'],
  targetEntityKinds: ['node', 'element'],
  getAttachments(model) {},
  render(context) {}
}
```

Current attachment kind names are `load`, `restraint`, `release`, and `rigid`.

### Overlay Layers

Overlay layers are plugin-owned and receive the shared projection/camera context.

```js
{
  id: 'frame-loads',
  phase: 'model',
  render(context) {}
}
```

### Result Layers

Result layers are solver-output visualizations. A frame plugin may draw moment
or shear diagrams. A plate plugin may draw stress contours. The shell only
registers and activates these layers.

```js
{
  id: 'plate-stress-sx',
  label: 'Sx',
  family: 'stress',
  entityKinds: ['plate'],
  render(context) {}
}
```

Result families are `displacement`, `force`, `moment`, `stress`, `strain`,
`reaction`, and `custom`.

### Toolbar Menus

Toolbar menus are slots registered by plugins. The shell can provide consistent
button styling and active-state behavior, while each project owns the contents.

```js
{
  id: 'mesh',
  label: 'Mesh',
  icon,
  renderPanel(context) {}
}
```

## Refactor Strategy From The Current Web App

1. Move pure shared logic first: camera, view modes, navigation, cursor,
   default state, theme tokens, plugin contracts.
2. Keep web compatibility wrappers so the current app remains stable.
3. Move frame-specific overlay rendering into a future frame plugin.
4. Move toolbar primitives into the shell, then let frame/plate plugins register
   their own menu groups.
5. Add project examples beside each package. Examples are reference fixtures,
   not just demos.
