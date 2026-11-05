import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { gzipSync } from 'node:zlib'

const root = resolve('apps/web/public/gridcraft'), manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'))
const sha = data => createHash('sha256').update(data).digest('hex')
if (manifest.revision !== '919a6b58fe6661de27af0609d02443ac9db467bf') throw Error('Unreviewed Gridcraft revision.')
for (const [path, key] of [['patch.mjs', 'patchSha256'], ['pm_host.rs', 'hostSha256'], ['pm_budget.rs', 'budgetSha256'], ['Cargo.lock', 'lockSha256']]) {
  if (sha(await readFile(new URL(path, import.meta.url))) !== manifest[key]) throw Error(`Gridcraft source changed; rebuild the artifact: ${path}`)
}
for (const name of ['index.html', 'loader.mjs']) {
  if (sha(await readFile(new URL(name, import.meta.url))) !== manifest.files[name]) throw Error(`Gridcraft wrapper changed; rebuild the artifact: ${name}`)
}
let bytes = 0
for (const [file, expected] of Object.entries(manifest.files)) {
  if (!/^[a-zA-Z0-9_./-]+$/.test(file) || file.includes('..') || file.startsWith('/')) throw Error('Invalid artifact path.')
  const content = await readFile(join(root, file))
  if (sha(content) !== expected) throw Error(`Gridcraft artifact checksum mismatch: ${file}`)
  if (/\.(wasm|js|mjs)$/.test(file)) bytes += gzipSync(content, { level: 9 }).byteLength
}
for (const required of ['gridcraft.js', 'gridcraft_bg.wasm', 'index.html', 'loader.mjs', 'LICENSE-MIT', 'LICENSE-APACHE', 'NOTICE', 'ATTRIBUTION.md']) {
  if (!manifest.files[required]) throw Error(`Missing artifact: ${required}`)
}
// Separate lazy asset budget: never added to the initial-route or analysis-worker allowance.
if (bytes > 10 * 1024 * 1024) throw Error(`Gridcraft lazy assets exceed 10 MiB gzip: ${bytes}`)
console.log(`Gridcraft artifact verified; lazy assets ${(bytes / 1024 / 1024).toFixed(2)} / 10.00 MiB gzip.`)
