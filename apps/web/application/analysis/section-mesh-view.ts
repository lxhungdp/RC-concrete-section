import {
  TRIANGLE_RULE,
  type ConcreteMesh,
  type ConcreteMeshReport
} from '@pm/geometry'

/**
 * Presentation-only, compact copy of an analysis mesh.
 *
 * Large object graphs are deliberately excluded. The buffers can be transferred zero-copy from
 * the analysis worker, and quadrature locations are reconstructed from the exact barycentric rule
 * rather than shipping three point objects per triangle.
 */
export type SectionMeshView = {
  report: ConcreteMeshReport
  triangleCount: number
  /** ax, ay, bx, by, cx, cy — six Float64 values per triangle. */
  coordinates: Float64Array
  /** Exact triangle area in mm². */
  areas: Float64Array
  /** depth, component, local triangle number — three Int32 values per triangle. */
  metadata: Int32Array
  /** Triangle ranges for base cell `i * gridY + j`; length = gridX * gridY + 1. */
  cellOffsets: Uint32Array
  /** Flattened barycentric triples used by the concrete integration rule. */
  quadratureRule: Float64Array
  grid: {
    minX: number
    minY: number
    maxX: number
    maxY: number
    cellSize: number
    gridX: number
    gridY: number
  }
}

export const MAX_SECTION_MESH_VIEW_TRIANGLES = 750_000
export const MIN_EXACT_MESH_CELL_PIXELS = 2.5
export const MIN_MESH_LOD_GRID_PIXELS = 5
export const MAX_EXACT_MESH_TRIANGLES_PER_FRAME = 60_000

export const sectionMeshRenderPlan = (cellPixels: number, visibleTriangles: number) => {
  const exact =
    cellPixels >= MIN_EXACT_MESH_CELL_PIXELS &&
    visibleTriangles <= MAX_EXACT_MESH_TRIANGLES_PER_FRAME
  if (exact) return { exact: true as const, stride: 1 }
  const densityStride = Math.max(
    1,
    Math.ceil(Math.sqrt(visibleTriangles / MAX_EXACT_MESH_TRIANGLES_PER_FRAME))
  )
  const pixelStride = Math.max(
    1,
    Math.ceil(MIN_MESH_LOD_GRID_PIXELS / Math.max(cellPixels, 1e-9))
  )
  return { exact: false as const, stride: Math.max(densityStride, pixelStride) }
}

export const sectionMeshTransferList = (view: SectionMeshView): Transferable[] => [
  view.coordinates.buffer,
  view.areas.buffer,
  view.metadata.buffer,
  view.cellOffsets.buffer,
  view.quadratureRule.buffer
]

/** Packs and cell-orders the exact kernel mesh into bounded transferable buffers. */
export const packSectionMeshView = (mesh: ConcreteMesh): SectionMeshView => {
  const triangleCount = mesh.triangles.length
  if (triangleCount > MAX_SECTION_MESH_VIEW_TRIANGLES) {
    throw new Error(
      `The exact mesh contains ${triangleCount.toLocaleString('en-US')} triangles, above the ` +
        `${MAX_SECTION_MESH_VIEW_TRIANGLES.toLocaleString('en-US')} triangle display limit. ` +
        'Analysis remains valid; use a coarser integration mesh to inspect it interactively.'
    )
  }

  const { gridX, gridY, cellSize } = mesh.report
  const gridCells = gridX * gridY
  const counts = new Uint32Array(gridCells)
  for (const triangle of mesh.triangles) {
    const cell = triangle.cellI * gridY + triangle.cellJ
    if (cell >= 0 && cell < gridCells) counts[cell]++
  }

  const cellOffsets = new Uint32Array(gridCells + 1)
  for (let cell = 0; cell < gridCells; cell++) cellOffsets[cell + 1] = cellOffsets[cell] + counts[cell]
  const cursors = cellOffsets.slice(0, gridCells)
  const coordinates = new Float64Array(triangleCount * 6)
  const areas = new Float64Array(triangleCount)
  const metadata = new Int32Array(triangleCount * 3)
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const triangle of mesh.triangles) {
    const cell = triangle.cellI * gridY + triangle.cellJ
    const target = cursors[cell]++
    const coordinateOffset = target * 6
    coordinates[coordinateOffset] = triangle.ax
    coordinates[coordinateOffset + 1] = triangle.ay
    coordinates[coordinateOffset + 2] = triangle.bx
    coordinates[coordinateOffset + 3] = triangle.by
    coordinates[coordinateOffset + 4] = triangle.cx
    coordinates[coordinateOffset + 5] = triangle.cy
    areas[target] = triangle.area
    const metadataOffset = target * 3
    metadata[metadataOffset] = triangle.depth
    metadata[metadataOffset + 1] = triangle.component
    metadata[metadataOffset + 2] = triangle.triangle
    minX = Math.min(minX, triangle.ax, triangle.bx, triangle.cx)
    minY = Math.min(minY, triangle.ay, triangle.by, triangle.cy)
    maxX = Math.max(maxX, triangle.ax, triangle.bx, triangle.cx)
    maxY = Math.max(maxY, triangle.ay, triangle.by, triangle.cy)
  }

  if (!Number.isFinite(minX)) {
    minX = 0
    minY = 0
    maxX = 0
    maxY = 0
  }

  return {
    report: mesh.report,
    triangleCount,
    coordinates,
    areas,
    metadata,
    cellOffsets,
    quadratureRule: new Float64Array(TRIANGLE_RULE.flat()),
    grid: { minX, minY, maxX, maxY, cellSize, gridX, gridY }
  }
}
