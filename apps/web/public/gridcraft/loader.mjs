import init from './gridcraft.js'
const session = new URLSearchParams(location.search).get('pm')
try {
  if (!session || parent === window) throw new Error('Open the spreadsheet from Demand Check.')
  await init({ module_or_path: new URL('./gridcraft_bg.wasm', import.meta.url) })
}
catch {
  document.querySelector('#gridcraft_loading').textContent = 'Spreadsheet could not start. Close and reopen it.'
  parent.postMessage({ type: 'pm-gridcraft', version: 2, session, event: 'failed', error: 'Spreadsheet could not start. A browser with WebGPU or WebGL2 is required.' }, location.origin)
}
