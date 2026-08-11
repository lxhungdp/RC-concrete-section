import { createRequire } from 'node:module'

const requireFromHere = createRequire(import.meta.url)

/**
 * Node entry used by tests and server-side tooling.
 *
 * `brotli-wasm` maps ESM `import` to its web build, whose WASM initializer uses `fetch`. Requiring
 * the package selects its declared Node build without changing the browser codec or payload format.
 */
export const importProjectShareBrotli = async (): Promise<unknown> => requireFromHere('brotli-wasm')
