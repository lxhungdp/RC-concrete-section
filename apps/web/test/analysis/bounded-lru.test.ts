import assert from 'node:assert/strict'
import test from 'node:test'
import { BoundedLruCache } from '../../application/analysis/bounded-lru'

test('bounded LRU promotes reads and evicts only the least-recently-used entry', () => {
  const cache = new BoundedLruCache<string, number>(2)
  cache.set('a', 1)
  cache.set('b', 2)
  assert.equal(cache.get('a'), 1)
  cache.set('c', 3)
  assert.equal(cache.get('b'), undefined)
  assert.equal(cache.get('a'), 1)
  assert.equal(cache.get('c'), 3)
  assert.equal(cache.size, 2)
})

test('bounded LRU replaces an existing key without evicting another entry', () => {
  const cache = new BoundedLruCache<string, number>(2)
  cache.set('a', 1)
  cache.set('b', 2)
  cache.set('a', 3)
  assert.equal(cache.get('a'), 3)
  assert.equal(cache.get('b'), 2)
  assert.equal(cache.size, 2)
})

test('bounded LRU rejects unbounded or invalid limits', () => {
  assert.throws(() => new BoundedLruCache(0))
  assert.throws(() => new BoundedLruCache(Number.POSITIVE_INFINITY))
})
