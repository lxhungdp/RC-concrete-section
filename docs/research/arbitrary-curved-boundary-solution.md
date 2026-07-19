# Polygon-Only Arbitrary Boundary Solution

## Core Decision

All final section boundaries are polygon rings.

```ts
type SectionGeometry = {
  id: string;
  name: string;
  unit: "mm";
  outer: Point2[];
  holes: Point2[][];
};
```

This rule applies to everything:

- outer boundary is a list of points;
- every inner boundary / hole is also a list of points;
- circles, semicircles, slots, rounded corners, and curved edges are approximated by many short line segments;
- the P-M-M kernel only receives `SectionGeometry`, never arcs or primitives.

The app may keep a separate construction history, but that history is not the calculation model.

```text
construction primitives + boolean operations
  -> compose
  -> final SectionGeometry { outer, holes }
  -> section properties / P-M-M kernel
```

## Recommended Interaction Model

Use a **Boundary Workspace**.

The user does not start by editing the final `outer` and `holes`. The user creates multiple independent polygon boundaries, selects one or more boundaries, then applies boolean actions.

```text
Boundary A = rectangle polygon
Boundary B = circle polygon
Boundary C = circle polygon

select A + B + C
click Union
  -> Boundary D = merged outer boundary
```

Every boundary is still only a point list:

```ts
type BoundaryObject = {
  id: string;
  name: string;
  points: Point2[];
  source?: BoundarySource;
  selected: boolean;
  locked?: boolean;
  visible?: boolean;
};
```

`source` is optional construction metadata so the app can later edit a generated rectangle/circle parametrically. It is not needed by the P-M-M kernel.

```ts
type BoundarySource =
  | { kind: "manual" }
  | { kind: "rectangle"; center: Point2; width: number; height: number; rotation?: number }
  | { kind: "circle"; center: Point2; radius: number; segments: number }
  | { kind: "polygon" };
```

The workspace state can be:

```ts
type BoundaryWorkspace = {
  boundaries: BoundaryObject[];
  selectedBoundaryIds: string[];
  activeBoundaryId?: string;
  finalSection?: SectionGeometry;
};
```

Boolean actions create new boundary objects or final sections:

```text
Union selected      -> creates one merged BoundaryObject
Subtract selected   -> creates one BoundaryObject with holes if target contains cutters
Intersect selected  -> creates one overlapping BoundaryObject
Set As Section      -> converts selected boundary result into SectionGeometry
```

For predictable UX, boolean actions should follow this rule:

```text
first selected boundary = subject / base
remaining selected boundaries = tools / cutters
```

So:

```text
select [large, small]
Union      -> large shape, if small is fully inside, result is still large
Subtract   -> large with small hole
```

This matches the workflow you described.

## Two-Layer Model

### 1. Final Geometry

This is the single source used by calculation, display, point table, JSON export, and validation.

```ts
type FinalSection = {
  outer: Point2[];
  holes: Point2[][];
};
```

The editor must let the user select any ring:

```ts
type ActiveBoundary =
  | { kind: "outer" }
  | { kind: "hole"; index: number };
```

The selected ring is shown in the same point table:

```text
Outer  -> x/y list
Hole 1 -> x/y list
Hole 2 -> x/y list
```

This keeps the boundary representation consistent.

### 2. Boundary Objects

This layer is how users create arbitrary sections visually.

```text
quick generate rectangle -> BoundaryObject(points)
quick generate circle    -> BoundaryObject(points)
draw polygon             -> BoundaryObject(points)
import DXF/polyline      -> BoundaryObject(points)
boolean result           -> BoundaryObject(points or rings)
```

For a simple boundary object, `points` is enough.

For a boolean result that includes holes, use a compound boundary:

```ts
type BoundaryObject = {
  id: string;
  name: string;
  outer: Point2[];
  holes: Point2[][];
};
```

That is effectively the same shape as `SectionGeometry`, except it still lives in the construction workspace and may later be unioned/subtracted again.

Recommended unified type:

```ts
type BoundaryObject = {
  id: string;
  name: string;
  rings: Point2[][]; // rings[0] = outer, rings[1..] = holes
  source?: BoundarySource;
  selected: boolean;
};
```

Then final section is just:

```ts
const finalSection: SectionGeometry = {
  outer: boundary.rings[0],
  holes: boundary.rings.slice(1),
};
```

### 3. Construction Stack

This layer is how users create arbitrary sections faster than manually typing every point.

```ts
type PrimitiveOperation = "add" | "subtract" | "intersect";

type PrimitiveShape =
  | { kind: "rectangle"; center: Point2; width: number; height: number; rotation?: number }
  | { kind: "circle"; center: Point2; radius: number; segments: number }
  | { kind: "semicircle"; center: Point2; radius: number; startAngle: number; endAngle: number; segments: number }
  | { kind: "capsule"; center: Point2; width: number; height: number; segmentsPerCap: number }
  | { kind: "polygon"; points: Point2[] };

type ConstructionPrimitive = {
  id: string;
  name: string;
  operation: PrimitiveOperation;
  shape: PrimitiveShape;
  enabled: boolean;
};
```

This can be added later. The Boundary Workspace is the more natural first UI because it lets users select and combine actual shapes on canvas.

Each primitive is converted to one or more polygon rings, then passed to `polygon-clipping`.

```text
rectangle primitive   -> Point2[]
semicircle primitive  -> Point2[]
capsule primitive     -> Point2[]
circle primitive      -> Point2[]
polygon primitive     -> Point2[]
```

## Boolean Composition Algorithm

For the Boundary Workspace, boolean actions operate on selected boundary objects.

```ts
function unionSelected(boundaries: BoundaryObject[], selectedIds: string[]) {
  const selected = getSelectedInSelectionOrder(boundaries, selectedIds);
  const result = polygonClipping.union(...selected.map(boundaryToMultiPolygon));
  return multiPolygonToBoundaryObjects(result);
}

function subtractSelected(boundaries: BoundaryObject[], selectedIds: string[]) {
  const [subject, ...cutters] = getSelectedInSelectionOrder(boundaries, selectedIds);
  const result = polygonClipping.difference(
    boundaryToMultiPolygon(subject),
    ...cutters.map(boundaryToMultiPolygon)
  );
  return multiPolygonToBoundaryObjects(result);
}
```

When the boolean action succeeds, choose one of two UX policies:

```text
Replace policy:
  remove selected boundaries
  add boolean result boundary

Keep-source policy:
  keep selected boundaries
  add boolean result boundary
  hide/lock selected boundaries optionally
```

Use **Keep-source policy** first. It is safer because users can recover and tweak the original rectangle/circles.

For the older primitive-stack approach, use a stack/list of primitives, ordered top to bottom.

```ts
let solid = emptyMultiPolygon();

for (const item of constructionStack) {
  if (!item.enabled) continue;

  const polygon = polygonizePrimitive(item.shape);

  if (item.operation === "add") {
    solid = union(solid, polygon);
  }

  if (item.operation === "subtract") {
    solid = difference(solid, polygon);
  }

  if (item.operation === "intersect") {
    solid = intersection(solid, polygon);
  }
}

const finalSection = normalizeBooleanResult(solid);
```

Normalization must:

- close rings for the boolean library;
- snap coordinates to a tolerance;
- remove duplicate adjacent points;
- remove unnecessary collinear points;
- select the exterior ring as `outer`;
- select interior rings as `holes`;
- reject or warn if the result has multiple disconnected solids.

For MVP, support one connected concrete region:

```text
MultiPolygon with 1 polygon -> OK
MultiPolygon with >1 polygon -> warn/reject or keep largest
```

## User Workflow

The UI should have three editing modes.

## Sidebar Redesign For Boundary Workflow

The sidebar should be rebuilt around boundary-level authoring, not point-level authoring.

Recommended layout:

```text
Geometry Sidebar

1. Boundary Builder
   quick generate rectangle / circle / capsule / polygon

2. Boundary List
   all created boundary objects
   selection order
   visibility / lock / duplicate / delete

3. Boolean Actions
   union / subtract / intersect
   result policy: keep sources or replace sources

4. Boundary Inspector
   parameters for generated boundary
   transform: center, move, rotate, scale

5. Ring Point Editor
   active boundary ring point table

6. Final Section
   set selected boundary as final section
   show outer/hole summary and validation
```

This order matches how users think:

```text
create shapes -> select shapes -> combine shapes -> inspect/edit result -> commit final section
```

### 1. Boundary Builder

Purpose: create independent boundary objects.

Controls:

```text
Shape type:
  Rectangle
  Circle
  Capsule / slot
  Polygon

Common:
  name
  center X
  center Y

Rectangle:
  width
  height
  rotation

Circle:
  radius
  segments

Capsule:
  width
  height
  segments per cap

Polygon:
  point input mode / draw on canvas

Action:
  Create Boundary
```

Important: quick generate must create a boundary object in the workspace, not replace the final section.

Example:

```text
Create Rectangle -> Boundary "Rect 1"
Create Circle    -> Boundary "Circle 1"
Create Circle    -> Boundary "Circle 2"
```

Each generated boundary is immediately visible on canvas and appears in the Boundary List.

### 2. Boundary List

Purpose: make selection boundary-level.

Each row:

```text
[visibility] [lock] [selection order badge] Boundary name [type] [point count] [...]
```

Selection rules:

- click row: select one boundary;
- shift/cmd click: multi-select;
- first selected boundary gets badge `1`;
- second selected gets badge `2`;
- selection order matters for `Subtract`;
- active boundary is the last clicked row and shows point handles.

Recommended row states:

```text
normal
hovered
selected
active selected
hidden
locked
boolean result
invalid
```

Actions per row:

```text
rename
duplicate
hide/show
lock/unlock
delete
fit to boundary
set active
```

The list should support compound boundary results:

```text
Boundary "Subtract result"
  outer: 86 pts
  holes: 2
```

### 3. Boolean Actions

Purpose: combine selected boundaries into a new boundary.

Controls:

```text
Union
Subtract
Intersect

Result policy:
  Keep sources (default)
  Replace sources

Result name:
  auto e.g. "Union 04"
```

Enable rules:

```text
Union      enabled when selected count >= 2
Subtract   enabled when selected count >= 2
Intersect  enabled when selected count >= 2
```

Subtract preview text should be explicit:

```text
Subtract: Boundary #1 minus Boundary #2, #3, ...
```

This avoids ambiguity.

Result behavior:

```text
Union selected:
  polygonClipping.union(selected...)
  -> new BoundaryObject

Subtract selected:
  subject = selected[0]
  cutters = selected[1..]
  polygonClipping.difference(subject, cutters...)
  -> new BoundaryObject, possibly with holes

Intersect selected:
  polygonClipping.intersection(selected...)
  -> new BoundaryObject
```

Post-action:

```text
add result boundary
select result boundary
set it active
if keep sources: optionally hide/lock sources
if replace sources: remove sources
```

Warnings:

```text
empty result
multiple disconnected regions
no change from operation
small sliver polygons removed
```

### 4. Boundary Inspector

Purpose: edit the active boundary as a whole.

For generated boundaries, show parametric controls:

```text
Rectangle:
  center X
  center Y
  width
  height
  rotation

Circle:
  center X
  center Y
  radius
  segments

Capsule:
  center X
  center Y
  width
  height
  segments per cap
```

Changing params regenerates that boundary's points.

For boolean result or manual polygon:

```text
Transform:
  move dx
  move dy
  rotate about centroid
  scale about centroid
```

Do not overbuild this at first. MVP inspector:

```text
name
type
point count
move center X/Y
```

### 5. Ring Point Editor

Purpose: edit actual polygon points for the active boundary.

For any boundary:

```text
Ring tabs:
  Outer
  Hole 1
  Hole 2

Point table:
  # | X | Y | delete
```

Rules:

- if active boundary has no holes, show only `Outer`;
- if active boundary is a subtract result, show outer and holes;
- dragging handles edits the selected ring;
- deleting a point is disabled when ring has only 3 points;
- point edits convert a generated boundary to manual or mark its source params stale.

This panel is secondary. The default selection should be the boundary, not an individual point.

### 6. Final Section Panel

Purpose: commit a boundary result to the P-M-M model.

Controls:

```text
Set Active Boundary As Final Section
Export SectionGeometry JSON
Validate
```

Summary:

```text
outer points
holes count
hole points total
area
centroid X/Y
warnings
```

Commit rule:

```ts
const finalSection = {
  id,
  name,
  unit: "mm",
  outer: activeBoundary.rings[0],
  holes: activeBoundary.rings.slice(1),
};
```

This is the only object sent to the P-M-M kernel.

### Sidebar State Machine

Recommended state:

```ts
type SidebarMode = "build" | "select" | "inspect" | "final";

type GeometryEditorState = {
  boundaries: BoundaryObject[];
  selectedBoundaryIds: string[];
  selectionOrder: string[];
  activeBoundaryId?: string;
  activeRingIndex: number;
  finalSection?: SectionGeometry;
};
```

Selection behavior:

```text
0 selected:
  show Boundary Builder prominently
  disable Boolean Actions

1 selected:
  show Boundary Inspector
  show Ring Point Editor
  enable Set As Final Section

2+ selected:
  show Boolean Actions prominently
  show selection order
  still show active boundary inspector collapsed
```

### Canvas Behavior

Sidebar and canvas must agree.

Canvas interactions:

```text
click boundary fill/outline -> select boundary
shift-click -> add/remove boundary from selection
drag selected boundary -> move whole boundary
click point handle -> point edit mode for active boundary
escape -> clear point selection, keep boundary selection
```

Boundary visuals:

```text
unselected boundary: muted outline
selected boundary: highlighted outline
active boundary: stronger outline + point handles
boolean result: distinct result color or badge
hidden source: not shown
locked source: shown but not editable
```

### MVP Sidebar To Build First

Build this first:

```text
1. Boundary Builder
   rectangle: centerX, centerY, width, height
   circle: centerX, centerY, radius, segments
   Create Boundary

2. Boundary List
   row select
   multi-select with checkboxes
   delete

3. Boolean Actions
   Union
   Subtract
   Keep sources default

4. Ring Point Editor
   active boundary outer/hole tabs
   point table

5. Final Section
   Set Active Boundary As Final Section
```

This MVP is enough to create:

```text
rectangle + two circles -> Union -> large outer
small rectangle + two small circles -> Union -> small inner shape
large outer - small inner shape -> Subtract -> section with hole
```

Then extend with:

```text
capsule quick shape
rotation
import DXF/polyline
snap center to midpoint
replace-source policy
operation preview
undo/redo
```

### Mode A: Boundary Workspace

This is the main creation workflow.

Panel:

```text
Boundaries
  [ ] Rect 1
  [ ] Circle left
  [ ] Circle right
  [ ] Union result

Actions
  Union
  Subtract
  Intersect
  Set As Final Section
```

Canvas:

- click boundary to select it;
- shift-click to multi-select;
- selected boundary highlights as a whole;
- point handles appear only for the active boundary;
- moving a boundary moves all its points;
- editing a point edits that boundary's ring.

Quick generate must include position:

```text
Rectangle:
  centerX, centerY, width, height, rotation

Circle:
  centerX, centerY, radius, segments

Capsule:
  centerX, centerY, width, height, segmentsPerCap
```

This allows exact placement, for example circle centers at the midpoints of rectangle side edges.

### Mode B: Final Boundary Editing

Used after composition, or for manual refinement.

Panel:

```text
Boundaries
  [Outer] [Hole 1] [Hole 2] ...

Point table for selected ring:
  # | X | Y | delete
```

Actions:

- select ring;
- select point;
- drag point on canvas;
- edit x/y in table;
- add point after selected;
- delete point;
- export final `SectionGeometry`.

This is the canonical model.

### Mode C: Primitive Composer

Used to create complex sections.

Panel:

```text
Primitive Stack
  + Add Rectangle
  + Add Circle
  + Add Semicircle
  + Add Capsule
  + Add Polygon

Rows:
  [Add/Subtract/Intersect] [Shape] [Params] [Enable] [Delete]
```

For each row, the user can set:

- operation: add / subtract / intersect;
- shape type;
- center x/y;
- width/height/radius;
- segment count;
- rotation if supported later.

Every parameter change recomposes the final section immediately:

```text
primitive params changed
  -> polygonize all enabled primitives
  -> boolean compose
  -> update final SectionGeometry
  -> redraw outer + holes
  -> update ring point tabs and point table
```

## Example: Outer Rectangle + Two Semicircles

Goal:

```text
outer = rectangle + left semicircle + right semicircle
```

Construction stack:

```text
1. Add rectangle
   center = (0, 0)
   width = 420
   height = 260

2. Add left semicircle
   center = (-210, 0)
   radius = 130
   startAngle = 90 deg
   endAngle = 270 deg
   segments = 32

3. Add right semicircle
   center = (210, 0)
   radius = 130
   startAngle = -90 deg
   endAngle = 90 deg
   segments = 32
```

Boundary Workspace workflow:

```text
1. Generate rectangle boundary
   center = (0, 0)
   width = 420
   height = 260

2. Generate left circle boundary
   center = (-210, 0)
   radius = 130
   segments = 64

3. Generate right circle boundary
   center = (210, 0)
   radius = 130
   segments = 64

4. Select rectangle + left circle + right circle

5. Click Union
   -> creates one merged boundary
```

The result is not literally "semicircle primitives"; it is cleaner for users:

```text
full circles overlap the rectangle
union keeps only the exterior outline
internal circle parts disappear
```

This is usually easier than making users define half-circle angles.

Boolean result:

```text
union(rectangle, leftSemicircle, rightSemicircle)
  -> one final outer Point2[]
```

The straight diameter of each semicircle overlaps the rectangle edge. `union` removes the internal overlapping edges and returns one exterior polygon ring.

## Example: Two Holes, Each Rectangle + Two Semicircles

Each hole can be built using the same method.

Construction stack continued:

```text
4. Subtract left capsule hole
   center = (-105, 0)
   width = 130
   height = 70
   segmentsPerCap = 20

5. Subtract right capsule hole
   center = (105, 0)
   width = 130
   height = 70
   segmentsPerCap = 20
```

Boundary Workspace workflow:

```text
1. Generate small rectangle boundary
   center = (-105, 0)
   width = 70
   height = 70

2. Generate small left circle
   center = (-140, 0)
   radius = 35

3. Generate small right circle
   center = (-70, 0)
   radius = 35

4. Select the three small boundaries

5. Click Union
   -> creates left-hole boundary

6. Repeat for right-hole boundary

7. Select large boundary first, then left-hole + right-hole boundaries

8. Click Subtract
   -> creates final section boundary with holes
```

If instead the user selects large + small and clicks Union:

```text
the result is just the large boundary
```

because the small boundary is fully inside the large one. This is correct boolean behavior.

Boolean result:

```text
difference(outerSolid, leftHole, rightHole)
  -> final SectionGeometry

SectionGeometry.outer = exterior polygon points
SectionGeometry.holes[0] = left hole polygon points
SectionGeometry.holes[1] = right hole polygon points
```

The point table must show:

```text
Outer  -> exterior points
Hole 1 -> left hole points
Hole 2 -> right hole points
```

## Implementation Status In This Project

Implemented foundation:

- `polygon-clipping` dependency;
- primitive helpers for rectangle, circle, semicircle, and capsule polygon rings;
- `composeSectionPrimitives()` for add/subtract/intersect;
- normalization into `SectionGeometry { outer, holes }`;
- example construction stack for rectangle + semicircle outer and two capsule holes;
- SVG compound path with `fillRule="evenodd"`;
- point table can select and edit outer or hole rings.

Still needed for full custom user creation:

- Primitive Stack UI;
- row-level add/subtract/intersect selector;
- shape parameter forms;
- live recomposition from primitive rows;
- validation messages when boolean output is empty, disconnected, or self-intersecting;
- optional save/load of construction history next to final geometry.

## Recommended Next UI Implementation

Build the Primitive Stack panel first, not more drawing tools.

Minimum useful implementation:

```text
Primitive rows:
  operation: select(add/subtract/intersect)
  shape: select(rectangle/circle/semicircle/capsule)
  centerX, centerY
  width, height, radius
  segments
  enabled
  delete

Buttons:
  Add Rectangle
  Add Semicircle
  Add Capsule
  Add Circle
  Apply/Commit to final SectionGeometry
```

This lets users create the example without writing coordinates manually:

```text
Add rectangle
Add left semicircle
Add right semicircle
Subtract left capsule
Subtract right capsule
```

After each compose, the final model remains only:

```ts
outer: Point2[];
holes: Point2[][];
```
