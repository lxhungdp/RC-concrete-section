/** A/B benchmark for the boundary-cell spatial classifier against all-cells polygon booleans. */
import { buildConcreteMesh, sectionGeometryFromGeometryInput } from '@pm/geometry'
import { referenceProjectDocument } from '../reference-case'

const section = sectionGeometryFromGeometryInput(referenceProjectDocument().inputs.geometry)
const sizes = [50, 25, 12.5, 6.25]

const timed = <T>(run: () => T) => {
  run()
  let value!: T
  let minimum = Number.POSITIVE_INFINITY
  for (let repeat = 0; repeat < 3; repeat++) {
    const start = performance.now()
    value = run()
    minimum = Math.min(minimum, performance.now() - start)
  }
  return { value, ms: minimum }
}

console.log('h (mm)   grid cells   all-cell boolean   spatial fast path   speed-up   quadratic Δ')
for (const cellSize of sizes) {
  const before = timed(() => buildConcreteMesh(section, { cellSize, spatialAcceleration: false }))
  const after = timed(() => buildConcreteMesh(section, { cellSize }))
  const integral = (mesh: typeof after.value) =>
    mesh.points.reduce(
      (sum, point) => sum + point.area * (1 + point.x - 2 * point.y + point.x ** 2 + point.x * point.y),
      0
    )
  const delta = Math.abs(integral(after.value) - integral(before.value))
  console.log(
    `${cellSize.toString().padStart(6)} ${String(before.value.report.gridX * before.value.report.gridY).padStart(12)}` +
      ` ${before.ms.toFixed(1).padStart(17)} ms ${after.ms.toFixed(1).padStart(16)} ms` +
      ` ${(before.ms / after.ms).toFixed(2).padStart(9)}× ${delta.toExponential(2).padStart(13)}`
  )
}
