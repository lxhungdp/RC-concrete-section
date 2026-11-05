import init from './gridcraft.js'
const query = new URLSearchParams(location.search), session = query.get('pm')
const project = query.get('project') === '1'
const host = parent
const canvas = document.querySelector('canvas')
let loading, status
if (project) {
  document.documentElement.dataset.pmProject = 'true'
  document.documentElement.dataset.pmBusy = 'true'
  canvas.setAttribute('aria-label', 'Project spreadsheet')
  loading = document.createElement('div'); loading.id = 'pm_project_loading'; loading.textContent = 'Opening project…'
  status = document.createElement('div'); status.id = 'pm_project_status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite')
  document.body.append(loading, status)
  addEventListener('message', event => {
    const data = event.data
    if (event.source !== host || event.origin !== location.origin || data?.type !== 'pm-gridcraft' || data.version !== 4 || data.session !== session) return
    if (data.action !== 'status' || typeof data.busy !== 'boolean' || typeof data.message !== 'string') return
    document.documentElement.dataset.pmBusy = String(data.busy)
    document.documentElement.dataset.pmFailed = String(data.failed === true)
    status.textContent = data.message; status.setAttribute('role', data.failed ? 'alert' : 'status')
    canvas.inert = data.busy; canvas.setAttribute('aria-busy', String(data.busy))
    if (!data.busy && document.hasFocus()) canvas.focus({ preventScroll: true })
  })
}
try {
  if (!session || !host || host === window) throw new Error('Open the spreadsheet from P-M.')
  await init({ module_or_path: new URL('./gridcraft_bg.wasm', import.meta.url) })
}
catch {
  const message = 'Spreadsheet could not start. A browser with WebGPU or WebGL2 is required.'
  const surface = loading ?? document.querySelector('#gridcraft_loading')
  if (surface) surface.textContent = message
  host?.postMessage({ type: 'pm-gridcraft', version: 4, session, event: 'failed', error: message }, location.origin)
}
