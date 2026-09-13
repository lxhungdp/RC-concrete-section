/** Small deterministic LRU used to bound worker-owned analysis objects. */
export class BoundedLruCache<TKey, TValue> {
  readonly #limit: number
  readonly #values = new Map<TKey, TValue>()

  constructor(limit: number) {
    if (!Number.isInteger(limit) || limit < 1) throw new Error('LRU cache limit must be a positive integer.')
    this.#limit = limit
  }

  get size() {
    return this.#values.size
  }

  get(key: TKey): TValue | undefined {
    const value = this.#values.get(key)
    if (value === undefined) return undefined
    this.#values.delete(key)
    this.#values.set(key, value)
    return value
  }

  set(key: TKey, value: TValue) {
    this.#values.delete(key)
    this.#values.set(key, value)
    if (this.#values.size <= this.#limit) return
    const oldest = this.#values.keys().next().value as TKey | undefined
    if (oldest !== undefined) this.#values.delete(oldest)
  }
}
