# Section Drawing Platform Proposal

Date: 2026-07-19

Goal:

Build the first frontend foundation for the P-M-M project: a 2D cross-section drawing platform with smooth pan/zoom, stable engineering annotations, and clean data output for the future calculation kernel.

Reference product:

- Eagle Eye Column Designer: `https://eaglei.tech/column`

Observed benchmark behavior:

- 2D cross-section authoring.
- Dimension/text/labels remain readable while zooming and panning.
- Geometry editing is productized, not just a canvas demo.
- The drawing surface is part of a larger workflow: materials, geometry, reinforcement, loading, capacity, moment-curvature, reporting.

---

## 1. Core Requirement

The drawing platform must separate two coordinate systems:

```text
world coordinates:
  real engineering units, e.g. mm
  section boundary, holes, bars, dimensions anchors

screen coordinates:
  pixels
  labels, handle sizes, line widths, text sizes, selection grips
```

This is the most important architectural decision.

Zoom and pan should transform the world, but UI annotations must not visually inflate or shrink unless we intentionally want them to.

Example:

```text
At zoom 0.25x or 8x:
  rebar diameter in world units changes visually with zoom
  dimension text stays 12 px
  selection handles stay 8 px
  dimension arrowheads stay 6 px
  stroke width for guide/dim lines stays 1-2 px
```

---

## 2. Recommended Technology Stack

### Recommended MVP stack

```text
TypeScript
React
Vite or Next.js
Konva + react-konva
Zustand for editor state
Zod for schema validation
Vitest for geometry/editor tests
Playwright for UI interaction tests
```

Why:

- React gives a familiar app/component architecture.
- TypeScript is essential because geometry state gets complex quickly.
- Konva gives a retained-mode canvas scene graph with layers, hit-testing, events, and React bindings.
- Konva has established patterns for zooming relative to pointer position and object transformation.
- Zustand is lightweight and good for editor state without too much ceremony.
- Zod lets the drawing package emit validated JSON directly into the calculation kernel.

---

## 3. Rendering Library Options

### 3.1 Konva / react-konva

Recommendation: **best choice for the first drawing platform**.

Best for:

- 2D technical editor.
- Shapes, lines, polygons, circles, bars, handles.
- Multiple layers.
- Pointer events and hit testing.
- React integration.
- Smooth pan/zoom.
- Custom rendering rules.

Useful Konva features:

- `Stage`, `Layer`, shapes.
- `Transformer` for selection/resize/rotate workflows.
- Wheel zoom relative to pointer.
- Drag and pointer event handling.
- Canvas performance without manually managing every draw call.

Key implementation idea:

```text
Layer 1: world geometry
  boundary polygons
  holes
  rebars
  material regions

Layer 2: world guides
  axes
  grid
  snap lines

Layer 3: screen-stable annotations
  dimensions
  text labels
  arrowheads
  handles
```

For layer 3, either:

1. Draw in screen coordinates after projecting world anchor points to screen; or
2. Put labels/handles in world coordinates but apply inverse scale:

```text
label.scale = 1 / viewport.scale
strokeWidth = baseStroke / viewport.scale
```

The first approach is cleaner for dimensions and text. The second is convenient for simple handles.

Verdict:

Use Konva for MVP.

### 3.2 Fabric.js

Recommendation: **good alternative, but less ideal for our specific editor**.

Strengths:

- Very mature object model.
- Built-in object selection, controls, grouping, text editing.
- Serialization.
- SVG import/export.
- Canvas zoom/pan support.
- Custom controls.

Why not primary:

- Fabric gives many built-in object-editing behaviors, which is great for general design tools but can fight a precise engineering model.
- A CAD-like section editor needs strict control over geometry constraints, snap behavior, dimensions, and schema output.
- Non-scaling dimension annotation is possible, but the object model may become awkward once we need exact world/screen separation.

Use Fabric if:

- The product becomes closer to a general drawing/design tool.
- We need rich on-canvas text editing and SVG import/export early.

### 3.3 PixiJS

Recommendation: **not for MVP editor; useful later for high-performance visualization**.

Strengths:

- WebGL renderer.
- Very fast for many objects.
- Good for interactive stress/fiber visualization and dense P-M-M surfaces.

Weaknesses for our first drawing editor:

- Lower-level than Konva/Fabric for CAD-style object editing.
- Text in WebGL has important performance/quality caveats.
- Custom controls, precise editing, and engineering annotations require more infrastructure.

Use PixiJS later for:

- Stress/strain field animation.
- Dense fiber visualization.
- 3D-ish or GPU-heavy views.

### 3.4 SVG

Recommendation: **useful for export/report, not as main editor canvas**.

Strengths:

- Crisp text and vector output.
- CSS can keep text readable.
- Easy export to reports.
- Browser-native DOM inspection.

Weaknesses:

- Performance can degrade with many fibers, bars, handles, dimensions, and interactions.
- Complex pan/zoom with many nodes can become less smooth than canvas.
- Engineering editors often need fine-grained custom interaction behavior.

Use SVG for:

- Static report drawing.
- Exported section figures.
- Maybe small previews.

### 3.5 Paper.js

Recommendation: **interesting geometry/vector toolkit, not primary app platform**.

Strengths:

- Vector paths.
- Hit testing.
- Geometry operations.
- Good mental model for path editing.

Weaknesses:

- Smaller modern React/product ecosystem than Konva/Fabric.
- Less convenient for building a full web application editor.

Use only if:

- We need its path-editing model specifically.

---

## 4. Best Architecture

Do not let the canvas library become the source of truth.

Use this architecture:

```text
section-editor-core/
  pure TypeScript data model
  geometry operations
  snapping
  dimensions
  validation
  import/export schema

section-editor-konva/
  React + Konva renderer
  pointer interaction tools
  visual handles
  pan/zoom viewport

pm-kernel/
  calculation engine later
  consumes exported section schema
```

The section schema should be independent of Konva.

Bad:

```text
save Konva nodes as project data
```

Good:

```text
save engineering entities:
  boundary polygon
  holes
  rebars
  material regions
  dimensions
  units
```

---

## 5. Proposed Data Model

Minimum project schema:

```ts
type Point = {
  x: number; // mm
  y: number; // mm
};

type Ring = {
  id: string;
  points: Point[];
};

type Rebar = {
  id: string;
  x: number;
  y: number;
  dia: number;
  materialId: string;
};

type SectionModel = {
  units: "mm";
  boundary: Ring;
  holes: Ring[];
  rebars: Rebar[];
  materials: Material[];
  dimensions: DimensionEntity[];
};
```

Future:

```ts
type MaterialRegion = {
  id: string;
  ring: Ring;
  materialId: string;
};
```

This lets us later model:

- Cover concrete.
- Confined core.
- Retrofit jackets.
- Steel plates.
- Composite regions.

---

## 6. Viewport Model

Maintain one viewport object:

```ts
type Viewport = {
  scale: number;      // px per mm or normalized scale
  offsetX: number;    // screen px
  offsetY: number;    // screen px
};
```

Projection:

```ts
screenX = worldX * scale + offsetX
screenY = -worldY * scale + offsetY
```

Inverse projection:

```ts
worldX = (screenX - offsetX) / scale
worldY = -(screenY - offsetY) / scale
```

Use `worldY` upward positive for engineering consistency, even though browser screen Y goes downward.

---

## 7. Non-Scaling Text, Dimensions, and Handles

Use two rendering modes.

### 7.1 World-scaled entities

These should scale with zoom:

- Concrete boundary.
- Holes.
- Rebar circles.
- Material regions.
- Real geometry.

Example:

```text
rebar dia 32 mm should look larger when zooming in
```

### 7.2 Screen-stable entities

These should stay constant in pixels:

- Dimension text.
- Dimension line stroke.
- Arrowheads.
- Selection handles.
- Snap point markers.
- Hover highlights.
- Tool cursor glyphs.

Render screen-stable entities by projecting their anchor points from world to screen and drawing them in screen coordinates.

Dimension example:

```text
world anchor A -> screen A
world anchor B -> screen B
draw dimension line between screen A/B
text position = midpoint in screen pixels
font size = 12 px
arrow size = 6 px
stroke = 1.5 px
```

This gives the Eagle-Eye-like behavior the user wants.

---

## 8. Tools to Build First

Do not start with all CAD tools. Build the minimum editor pipeline.

### Package 1: viewport and canvas shell

Features:

- Infinite canvas feel.
- Wheel zoom toward pointer.
- Middle-mouse or space-drag pan.
- Fit section to view.
- Coordinate readout.
- Grid with adaptive spacing.

### Package 2: section boundary tool

Features:

- Draw polygon by clicking points.
- Close ring.
- Drag vertices.
- Insert/delete vertex.
- Snap to grid and existing points.
- Show dimensions while editing.

### Package 3: holes tool

Features:

- Draw inner polygon.
- Validate hole inside boundary.
- Prevent self-intersection.
- Export holes as rings.

### Package 4: rebar tool

Features:

- Place single bar.
- Set diameter.
- Copy/array bars.
- Rectangular perimeter pattern.
- Circular pattern later.

### Package 5: dimension/annotation tool

Features:

- Linear dimensions.
- Coordinate labels.
- Angle label later.
- All text/arrowheads non-scaling.

### Package 6: section validation/export

Features:

- Check ring orientation.
- Check self-intersection.
- Check holes.
- Check rebars inside concrete and outside holes.
- Export JSON for P-M-M kernel.

---

## 9. Geometry Libraries

Start conservative.

MVP:

- Implement basic geometry functions ourselves:
  - point projection
  - segment intersection
  - polygon area
  - centroid
  - point-in-polygon
  - ring orientation
  - bounding box

Add external geometry libraries only where needed:

- Polygon boolean operations: evaluate `polygon-clipping`, `martinez-polygon-clipping`, or Clipper-style libraries.
- Robust predicates: consider exact/robust geometry packages if numerical issues become painful.

Important:

The P-M-M kernel needs reliable polygon intersection. The editor should use the same geometry core for validation so UI and calculation do not disagree.

---

## 10. Final Recommendation

Best foundation:

```text
React + TypeScript + Konva/react-konva
with a custom world/screen viewport model
and a canvas-independent section data schema
```

Do not choose Fabric as the main platform unless we prioritize general drawing/text editing over engineering constraints.

Do not choose PixiJS first unless we already know the scene will be extremely large or GPU-heavy.

Do not choose SVG as the main editor if we want Eagle-Eye-like smooth pan/zoom at scale.

Use SVG later for clean report/export drawings.

---

## 11. First Implementation Milestone

The first milestone should be only this:

```text
Blank canvas
grid
pan
zoom-to-pointer
world coordinate readout
draw/edit one polygon
non-scaling vertex handles
non-scaling dimension labels
export SectionModel JSON
```

If this feels right, everything else can be attached cleanly later.

If this foundation feels wrong, the whole product will feel wrong.

