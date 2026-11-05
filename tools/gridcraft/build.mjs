/** Explicit dependency build; normal npm build uses the checked, self-hosted artifact. */
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, copyFile, readdir, stat } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { patchGridcraft } from './patch.mjs'

const revision = '919a6b58fe6661de27af0609d02443ac9db467bf'
const archiveSha256 = '43a1cef6eb3fdf4de2c18d5ececd46505e220701161f178e77fdd28be024b155'
const root = process.cwd(), cache = resolve('outputs/gridcraft'), out = resolve('apps/web/public/gridcraft')
const sha = data => createHash('sha256').update(data).digest('hex')
const run = (command, args, cwd) => {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', env: { ...process.env, CARGO_TARGET_DIR: join(cache, 'target') } })
  if (result.error) throw result.error
  if (result.status !== 0) throw Error(`${command} exited ${result.status}`)
}
await mkdir(cache, { recursive: true }); await mkdir(out, { recursive: true })
let archive
try { archive = await readFile(join(cache, 'source.zip')) }
catch {
  const response = await fetch(`https://codeload.github.com/storytold/gridcraft/zip/${revision}`)
  if (!response.ok) throw Error(`Source download failed: ${response.status}`)
  archive = Buffer.from(await response.arrayBuffer())
  await writeFile(join(cache, 'source.zip'), archive)
}
if (sha(archive) !== archiveSha256) throw Error('Gridcraft source archive checksum mismatch.')
const patch = await readFile(new URL('./patch.mjs', import.meta.url)), host = await readFile(new URL('./pm_host.rs', import.meta.url)), budget = await readFile(new URL('./pm_budget.rs', import.meta.url)), lock = await readFile(new URL('./Cargo.lock', import.meta.url))
const patchId = sha(Buffer.concat([patch, host, budget, lock])).slice(0, 16)
const extracted = join(cache, `patched-${patchId}`), source = join(extracted, `gridcraft-${revision}`)
try { await stat(join(extracted, '.patched')) }
catch {
  await mkdir(extracted, { recursive: true })
  if (process.platform !== 'win32') run('unzip', ['-q', join(cache, 'source.zip'), '-d', extracted], root)
  else {
    const script = join(cache, 'expand-source.ps1')
    await writeFile(script, 'param([string]$ArchivePath, [string]$DestinationPath)\nExpand-Archive -LiteralPath $ArchivePath -DestinationPath $DestinationPath -Force\n')
    run('powershell.exe', ['-NoProfile', '-File', script, join(cache, 'source.zip'), extracted], root)
  }
  await patchGridcraft(source)
  await writeFile(join(extracted, '.patched'), patchId)
}
run('cargo', ['+1.95.0', 'build', '--target', 'wasm32-unknown-unknown', '--release', '--locked', '-p', 'gridcraft-web'], source)
run('wasm-bindgen', [join(cache, 'target/wasm32-unknown-unknown/release/gridcraft-web.wasm'), '--target', 'web', '--no-typescript', '--remove-name-section', '--remove-producers-section', '--out-name', 'gridcraft', '--out-dir', out], root)
for (const name of ['index.html', 'loader.mjs']) await copyFile(new URL(name, import.meta.url), join(out, name))
for (const name of ['LICENSE-MIT', 'LICENSE-APACHE', 'NOTICE', 'ATTRIBUTION.md']) await copyFile(join(source, name), join(out, name))
const files = {}
const collect = async directory => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) await collect(path)
    else if (entry.name !== 'manifest.json') files[path.slice(out.length + 1).replaceAll('\\', '/')] = sha(await readFile(path))
  }
}
await collect(out)
await writeFile(join(out, 'manifest.json'), JSON.stringify({ revision, archiveSha256, patchSha256: sha(patch), hostSha256: sha(host), budgetSha256: sha(budget), lockSha256: sha(lock), rust: '1.95.0', wasmBindgen: '0.2.129', files }, null, 2) + '\n')
console.log('Built pinned Gridcraft artifact:', out)
