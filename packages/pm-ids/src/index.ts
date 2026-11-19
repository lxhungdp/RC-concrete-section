/** Positive integer entity ids used in UI, state, and project JSON. */
export type EntityId = number

export const isValidEntityId = (id: unknown): id is EntityId =>
  typeof id === 'number' && Number.isInteger(id) && id >= 1

/** Smallest unused positive integer (fills gaps: 1,3,4 → 2). */
export const nextAvailableId = (used: Iterable<number>): EntityId => {
  const set = new Set<number>()
  for (const id of used) {
    if (Number.isInteger(id) && id >= 1) set.add(id)
  }
  let id = 1
  while (set.has(id)) id += 1
  return id
}

/** Allocate `count` new ids, filling gaps against `used`. */
export const allocateIds = (count: number, used: Iterable<number> = []): EntityId[] => {
  const set = new Set<number>()
  for (const id of used) {
    if (Number.isInteger(id) && id >= 1) set.add(id)
  }
  const result: EntityId[] = []
  let id = 1
  while (result.length < count) {
    if (!set.has(id)) {
      result.push(id)
      set.add(id)
    }
    id += 1
  }
  return result
}

export const collectIds = <T extends { id: number }>(items: Iterable<T>): number[] =>
  [...items].map((item) => item.id)
