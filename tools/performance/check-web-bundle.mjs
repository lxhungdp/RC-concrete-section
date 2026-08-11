import { readFileSync, readdirSync, statSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { join, relative, resolve } from 'node:path'

const webBuild = resolve('apps/web/.next')
const chunkRoot = join(webBuild, 'static/chunks')
const htmlPath = join(webBuild, 'server/app/index.html')

const budgets = {
  initialGzip: 375 * 1024,
  plotlyGzip: 1400 * 1024,
  workerGzip: 120 * 1024,
  excelGzip: 300 * 1024,
  brotliWasmRaw: 1100 * 1024
}

const filesUnder = (directory) =>
  readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    return statSync(path).isDirectory() ? filesUnder(path) : [path]
  })

const gzipSize = (path) => gzipSync(readFileSync(path), { level: 9 }).byteLength
const format = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`

const assertBudget = (label, actual, maximum) => {
  const ok = actual <= maximum
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: ${format(actual)} / ${format(maximum)}`)
  if (!ok) process.exitCode = 1
}

const html = readFileSync(htmlPath, 'utf8')
const initialChunkPaths = [...html.matchAll(/src="\/_next\/(static\/chunks\/[^"?]+\.js)/g)]
  .map((match) => join(webBuild, match[1]))
const uniqueInitialChunks = [...new Set(initialChunkPaths)]
const initialGzip = uniqueInitialChunks.reduce((sum, path) => sum + gzipSize(path), 0)

const javascriptChunks = filesUnder(chunkRoot).filter((path) => path.endsWith('.js'))
const largestChunkContaining = (marker, label) => {
  const matches = javascriptChunks
    .filter((path) => readFileSync(path).includes(marker))
    .map((path) => ({ path, gzip: gzipSize(path) }))
    .sort((left, right) => right.gzip - left.gzip)
  if (matches.length === 0) throw new Error(`${label} chunk marker was not found in the production build.`)
  console.log(`      ${label}: ${relative(webBuild, matches[0].path)}`)
  return matches[0].gzip
}

const plotlyGzip = largestChunkContaining('plotly_click', 'Plotly chunk')
const workerGzip = largestChunkContaining('longer available in this worker', 'analysis worker chunk')
const excelGzip = largestChunkContaining('ExcelJS', 'Excel export chunk')
const wasmFiles = filesUnder(join(webBuild, 'static/media')).filter((path) => path.endsWith('.wasm'))
const brotliWasmRaw = Math.max(0, ...wasmFiles.map((path) => statSync(path).size))

console.log(`      initial chunks: ${uniqueInitialChunks.length}`)
assertBudget('initial JavaScript (gzip)', initialGzip, budgets.initialGzip)
assertBudget('Plotly lazy chunk (gzip)', plotlyGzip, budgets.plotlyGzip)
assertBudget('analysis worker chunk (gzip)', workerGzip, budgets.workerGzip)
assertBudget('Excel lazy chunk (gzip)', excelGzip, budgets.excelGzip)
assertBudget('Brotli WASM (raw)', brotliWasmRaw, budgets.brotliWasmRaw)
