/** Browser entry: keep the existing web-WASM codec and therefore the exact share payload format. */
export const importProjectShareBrotli = (): Promise<unknown> => import('brotli-wasm')
