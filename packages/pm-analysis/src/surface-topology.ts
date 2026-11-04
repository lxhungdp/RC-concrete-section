import type { SurfaceIndexTriangle } from '@pm/results/contracts'

export type PreparedSurfaceTriangle<T> = {
  vertices: [T, T, T]
  sameDirectionEdge: [boolean, boolean, boolean]
}

/** Reuses query wrappers; weak identities release their storage with the owning surface. */
export class IndexedSurfaceTopologyCache<T> {
  private readonly points = new WeakMap<T[], WeakMap<readonly SurfaceIndexTriangle[], PreparedSurfaceTriangle<T>[]>>()
  constructor(private readonly sameDirection: (left: T, right: T) => boolean) {}

  get(points: T[], topology: readonly SurfaceIndexTriangle[]): PreparedSurfaceTriangle<T>[] {
    let entries = this.points.get(points)
    if (!entries) { entries = new WeakMap(); this.points.set(points, entries) }
    const cached = entries.get(topology)
    // Canonical results are immutable. Reference/edge checks also prevent stale wrappers when a
    // direct caller replaces vertices/indices or edits direction metadata on a diagnostic DTO.
    if (cached?.length === topology.length) {
      let matches = true
      for (let index = 0; index < topology.length; index += 1) {
        const { a, b, c } = topology[index], previous = cached[index]
        const x = points[a], y = points[b], z = points[c]
        if (previous.vertices[0] !== x || previous.vertices[1] !== y || previous.vertices[2] !== z ||
          previous.sameDirectionEdge[0] !== this.sameDirection(x, y) ||
          previous.sameDirectionEdge[1] !== this.sameDirection(y, z) ||
          previous.sameDirectionEdge[2] !== this.sameDirection(z, x)) { matches = false; break }
      }
      if (matches) return cached
    }
    const triangles = topology.flatMap(({ a, b, c }): PreparedSurfaceTriangle<T>[] => {
      const x = points[a], y = points[b], z = points[c]
      if (x === undefined || y === undefined || z === undefined) return []
      return [{ vertices: [x, y, z], sameDirectionEdge: [
        this.sameDirection(x, y), this.sameDirection(y, z), this.sameDirection(z, x)
      ] }]
    })
    if (triangles.length === topology.length) entries.set(topology, triangles)
    return triangles
  }
}
