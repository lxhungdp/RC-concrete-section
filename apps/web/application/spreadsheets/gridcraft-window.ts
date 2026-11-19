import { GridcraftClient } from './gridcraft-client'

export type GridcraftWindow = Readonly<{ view: Window; client: GridcraftClient; session: string }>

/** Register a fresh checked session before navigating the modeless app window's frame. */
export function connectGridcraftWindow(view: Window, host: Window = window): GridcraftWindow {
  const session = crypto.randomUUID(), client = new GridcraftClient(view, session, host)
  try { view.location.replace(`${host.location.origin}/gridcraft/index.html?pm=${session}&project=1`) }
  catch (error) { client.dispose(); throw error }
  return { view, client, session }
}

/** Keep startup frames covered until the populated native UI has been composited. */
export async function presentGridcraftWindow(view: Window, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted || view.closed) return
  await new Promise<void>(resolve => {
    let frame = 0
    const done = () => { view.cancelAnimationFrame(frame); signal?.removeEventListener('abort', done); resolve() }
    signal?.addEventListener('abort', done, { once: true })
    frame = view.requestAnimationFrame(() => { frame = view.requestAnimationFrame(done) })
  })
  if (signal?.aborted || view.closed) return
  view.document.documentElement.dataset.pmPresented = 'true'
  view.document.getElementById('pm_project_loading')?.remove()
}
