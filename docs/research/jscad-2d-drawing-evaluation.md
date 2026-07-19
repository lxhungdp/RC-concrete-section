# JSCAD 2D Drawing Platform Evaluation for P-M Section Editor

Reference project path:

```text
/Users/lxh/Coding/Structures/jscad/
```

Branch inspected:

```text
develop/frame
```

Date: 2026-07-19

Instruction followed:

The `jscad` folder was inspected only. No files were edited there.

Purpose:

Evaluate whether the existing 2D drawing foundation in the `jscad` project can be reused for:

1. Drawing reinforced-concrete cross sections for the P-M / P-M-M project.
2. Later drawing 2D P-M and M-M diagrams.

---

## 1. What Exists in the JSCAD Project

The relevant package is:

```text
packages/cad-drawing
```

It is described as a reusable CAD drawing shell for structural and engineering viewers.

Its declared responsibilities:

- Camera state.
- CAD view modes: `3d`, `xy`, `xz`, `yz`.
- Orthographic 2D pan/zoom.
- Perspective 3D zoom-to-fit.
- Navigation modes: select, pan, rotate.
- Cursor resolution.
- Selection state.
- Extension contracts for entity layers, attachment layers, tools, overlays, result layers, and toolbar menus.
- Theme tokens.

Its explicit non-goal:

It does not know domain concepts such as frame members, plates, shells, supports, releases, or stress results. Those are meant to be supplied by plugins/adapters.

This is architecturally good for the P-M project, because our section editor can become another domain plugin instead of being hard-coded into the viewer shell.

---

## 2. Rendering Architecture

The current app is not React/Konva.

It uses:

```text
JSCAD web app
@jscad/regl-renderer
WebGL canvas
SVG overlay
nanohtml / morphdom
most gesture streams
```

Important files inspected:

```text
packages/cad-drawing/src/camera/viewerCamera.js
packages/cad-drawing/src/navigation/viewModes.js
packages/cad-drawing/src/extension/contracts.js
packages/web/src/ui/views/viewer.js
packages/web/src/ui/views/structureOverlaySync.js
packages/web/src/ui/views/viewer/viewerGrid.js
```

The rendering split is:

```text
WebGL canvas:
  grid
  axes
  3D solids / model entities

SVG overlay:
  screen-space lines
  labels
  node dots
  loads
  restraints
  releases
  selections
  previews
  FEM result diagrams
```

This is actually close to the behavior we want:

```text
real model geometry can zoom/pan
text/glyphs/handles can remain fixed in pixel size
```

---

## 3. 2D Camera and Pan/Zoom

The 2D modes are:

```text
xy
xz
yz
```

In 2D modes, the camera becomes orthographic:

```js
camera.projectionType = 'orthographic'
camera.cad2dPlane = mode
camera.unitsPerPixel = camera.unitsPerPixel || DEFAULT_CAD_2D_UNITS_PER_PIXEL
```

The core scale model is:

```text
unitsPerPixel = world units per screen pixel
```

This is the same idea as a CAD viewport:

```text
zoom in  -> unitsPerPixel decreases
zoom out -> unitsPerPixel increases
```

2D pan:

```js
dx = deltaPxX * unitsPerPixel
dy = deltaPxY * unitsPerPixel
camera.target += right * dx + up * dy
```

2D zoom:

```js
camera.unitsPerPixel = current * factor
```

Zoom-to-fit:

```text
collect model points
compute bounds
set camera.target to bounds center
set unitsPerPixel from bounds size / canvas size
```

Evaluation:

This is a solid base for section drawing. It already uses engineering world units and a stable 2D camera model.

Limitation:

The current `zoomCad2d()` changes zoom around the current camera target/center, not explicitly around the pointer. For an Eagle-Eye-like editor, zoom-to-pointer should be added.

Needed improvement:

```text
before zoom:
  world point under cursor = A
apply zoom
after zoom:
  adjust camera.target so A projects back to same screen pixel
```

---

## 4. Non-Scaling Labels, Dimensions, and Handles

This is the strongest part of the current platform for our needs.

`structureOverlaySync.js` projects world coordinates to CSS pixel coordinates:

```js
projectWorld(x, y, z, viewProj, cssW, cssH) -> [px, py, ndcz]
```

Then it draws SVG elements in screen coordinates:

```text
line x1/y1/x2/y2 in px
circle cx/cy/r in px
text x/y/font-size in px
```

Examples:

```js
appendScreenLabel(...)
appendLine(...)
appendCircle(...)
appendPolygon(...)
```

These use:

```text
font-size = fixed px
stroke-width = fixed px
circle radius = fixed px
vector-effect = non-scaling-stroke
```

This already solves the core requirement:

```text
dimension text, labels, handles, glyphs do not grow/shrink during zoom
```

This matches the Eagle Eye style requirement better than a simple all-canvas approach.

Conclusion:

The existing SVG overlay approach is very suitable for:

- Section labels.
- Vertex handles.
- Dimension text.
- Dimension arrows.
- Snap markers.
- Rebar tags.
- Hover highlights.
- P-M chart labels.

---

## 5. Current Plugin Architecture

The `cad-drawing` package has plugin contracts:

```js
createDrawingPlugin({
  id,
  label,
  entityLayers,
  attachmentLayers,
  tools,
  overlayLayers,
  resultLayers,
  toolbarMenus,
  selectionPanels
})
```

This is promising for P-M because we can define a new plugin:

```text
pm-section-plugin
```

Possible plugin responsibilities:

```text
entityLayers:
  boundary ring
  holes
  rebars
  material regions
  dimension entities

tools:
  draw boundary polygon
  draw hole polygon
  place rebar
  rectangular rebar pattern
  dimension tool
  select/edit vertex

overlayLayers:
  dimensions
  labels
  handles
  snap guides
  validation warnings

resultLayers:
  mesh strips
  compression block
  neutral axis
  stress/strain state
  P-M curve
  M-M contour
```

This maps cleanly to the P-M project.

---

## 6. Can This Draw P-M Cross Sections?

Short answer:

```text
Yes, but with an adapter/plugin layer and some editor-specific work.
```

Good fit:

- 2D orthographic camera already exists.
- World-unit coordinate system already exists.
- Smooth-ish pan/zoom already exists.
- Screen-space SVG overlay already solves non-scaling labels/handles.
- Plugin architecture is meant for new engineering domains.
- Snap and placement logic already exists for frame nodes.
- SVG overlay can draw section entities clearly.

Missing for section editing:

- Polygon ring editing.
- Hole ring editing.
- Segment/vertex hit testing for polygons.
- Rebar entity model.
- Rebar pattern generators.
- Dimension entity model.
- Dimension line/arrow rendering.
- Robust point-in-polygon / segment intersection validation.
- Section schema export.
- True 2D drawing mode focused on `xy` only.
- Zoom-to-pointer.

Current platform was built around frame nodes/elements. A P-M section editor needs polygon topology, not just node-element topology.

Therefore:

The platform is reusable as a viewer shell, but not as a ready-made section editor.

---

## 7. Can This Draw 2D P-M Diagrams?

Short answer:

```text
Yes, but P-M diagrams are better as a separate chart surface, not the same CAD viewport.
```

Options:

### Option A - Use same SVG overlay/camera system

Pros:

- Consistent pan/zoom.
- Non-scaling labels already solved.
- Can draw curves, points, demand markers, labels.

Cons:

- P-M diagrams are charts, not geometry models.
- Axes, ticks, scale formatting, legends, tooltips, and multiple curves are chart-specific.
- Reusing CAD camera may overcomplicate chart logic.

### Option B - Use a chart library

Recommended for P-M diagrams:

```text
Plotly, uPlot, D3/SVG, or custom SVG chart
```

Best fit:

- For P-M, M-M contours, interaction curves, demand points, hover tooltips, legends, export.

Recommendation:

Use the JSCAD/CAD drawing shell for **section editing**.
Use a separate chart module for **P-M diagrams**.

However, reuse concepts:

```text
screen-stable labels
world/chart coordinate projection
SVG overlay
selection/demand point interaction
```

---

## 8. Comparison With Earlier Konva Recommendation

Earlier recommendation:

```text
React + TypeScript + Konva/react-konva
```

After inspecting this `jscad` project:

If starting from zero:

```text
Konva remains simpler and faster to build a focused section editor.
```

If reusing your existing ecosystem:

```text
The JSCAD cad-drawing shell is a strong candidate because it already has
2D/3D CAD camera, SVG overlays, plugin boundaries, and engineering viewer logic.
```

Tradeoff:

| Topic | JSCAD cad-drawing | React + Konva |
|---|---|---|
| Existing in your codebase | Yes | No |
| 2D/3D shared viewer | Yes | Mostly 2D |
| Non-scaling labels | Already via SVG overlay | Need to implement |
| Engineering plugin idea | Already present | Need to design |
| Focused 2D editor simplicity | Medium | High |
| Modern React ecosystem | No | Yes |
| Existing WebGL/JSCAD integration | Strong | Weak |
| Learning/maintenance cost | Higher | Lower |
| Fit for P-M section editor | Good with adapter | Very good from scratch |
| Fit for P-M chart | Possible but not ideal | Also needs chart module |

Updated recommendation:

Use the JSCAD `cad-drawing` foundation if the goal is to grow inside your existing Structures/JSCAD ecosystem.

Use Konva only if you want a clean new web app dedicated to the P-M project, independent from the existing viewer.

---

## 9. Recommended Reuse Strategy

Do not copy the whole frame app.

Reuse these ideas/packages:

```text
packages/cad-drawing:
  camera
  2D view modes
  viewport scale model
  navigation state
  extension/plugin contracts
  theme tokens

packages/web overlay approach:
  projectWorld()
  SVG screen-space overlay
  non-scaling labels/lines/circles
  selection marquee ideas
  snap placement ideas
```

Avoid coupling P-M to:

```text
frame nodes/elements
frame solver
JSCAD script editor
3D solid generation
legacy app state shape
```

Build a new package:

```text
packages/pm-section-drawing
```

It should depend on:

```text
@structures/cad-drawing
```

But it should own:

```text
SectionModel schema
boundary/hole/rebar tools
dimension tools
section hit testing
section validation
section export
```

---

## 10. Proposed P-M Section Drawing Pipeline on JSCAD Foundation

```text
SectionModel
  -> pm-section adapter
  -> cad-drawing plugin:
       entity layers: boundary, holes, rebars
       tools: polygon, hole, rebar, dimension
       overlay layers: handles, labels, dimensions
  -> cad-drawing camera:
       xy orthographic
       pan/zoom/fit
  -> WebGL/SVG rendering:
       geometry drawing + screen-stable annotations
  -> emitted commands:
       add vertex
       move vertex
       close ring
       add hole
       add rebar
       update dimension
  -> host reducer updates SectionModel
  -> export JSON to P-M-M kernel
```

For P-M result visualization:

```text
P-M-M kernel output
  -> chart module:
       P-M curves
       M-M contours
       demand points
       capacity ratio
  -> optional cad overlay:
       show selected neutral axis and stress state on section drawing
```

---

## 11. Required Improvements Before Using It for P-M

### Must-have

1. Add zoom-to-pointer for 2D CAD mode.
2. Add a section-specific data schema.
3. Add polygon ring tool.
4. Add hole ring tool.
5. Add rebar point/entity tool.
6. Add vertex/segment hit testing.
7. Add screen-stable dimension rendering.
8. Add section validation.
9. Add JSON export compatible with the future P-M-M kernel.

### Should-have

1. Adaptive grid spacing by zoom level.
2. Snap to vertex, segment midpoint, intersection, grid.
3. Undo/redo command stack.
4. Property panel for selected boundary/hole/rebar/dimension.
5. Fit-to-section.
6. Unit-aware coordinate readout.

### Later

1. Boolean geometry editing.
2. DXF import/export.
3. Parametric section library.
4. Rebar pattern wizard.
5. Material region drawing.
6. Stress/strain overlay from calculation result.

---

## 12. Final Assessment

The JSCAD 2D foundation is suitable for the P-M section editor, especially because:

- It already has a real CAD camera model.
- It already supports 2D orthographic modes.
- It already separates world geometry from screen-space SVG overlays.
- It already has non-scaling labels/glyphs.
- It already has plugin contracts for domain-specific tools and layers.

But it is not ready as-is.

It needs a P-M-specific package/plugin for:

- Polygon topology.
- Holes.
- Rebars.
- Dimensions.
- Section validation.
- JSON export.

Recommended decision:

```text
Use JSCAD cad-drawing as the base shell if you want the P-M editor
to live inside the existing Structures/JSCAD ecosystem.

Do not use the frame app directly.
Build a new pm-section-drawing plugin/package on top of cad-drawing.
```

For P-M charts:

```text
Use a separate chart module, not the CAD viewer as the primary chart engine.
```

The best hybrid is:

```text
JSCAD cad-drawing shell for section editor
custom chart module for P-M/M-M diagrams
P-M-M kernel as independent computational package
```

