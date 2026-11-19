const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
type SaveWindow = Window & { showSaveFilePicker?: (options: {
  suggestedName: string; types: { description: string; accept: Record<string, string[]> }[]
}) => Promise<{ createWritable(): Promise<{ write(blob: Blob): Promise<void>; close(): Promise<void>; abort(): Promise<void> }> }> }

/** Pick a destination during the user gesture, then obtain the independent workbook bytes. */
export async function saveSpreadsheetXlsx(fileName: string, getBytes: () => Promise<ArrayBuffer>, view: Window = window): Promise<'saved' | 'downloaded' | 'cancelled'> {
  try {
    const picker = (view as SaveWindow).showSaveFilePicker
    const handle = picker ? await picker.call(view, { suggestedName: fileName, types: [{ description: 'Excel workbook', accept: { [MIME]: ['.xlsx'] } }] }) : undefined
    const bytes = await getBytes(), blob = new Blob([bytes], { type: MIME })
    if (handle) {
      const stream = await handle.createWritable()
      try { await stream.write(blob); await stream.close() }
      catch (error) { await stream.abort().catch(() => {}); throw error }
      return 'saved'
    }
    const url = URL.createObjectURL(blob), link = view.document.createElement('a')
    link.href = url; link.download = fileName
    ;(view.document.querySelector('dialog[open]') ?? view.document.body).append(link)
    link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60_000)
    return 'downloaded'
  } catch (error) {
    // A picker invoked on the child window returns that window's DOMException realm.
    if (error !== null && typeof error === 'object' && 'name' in error && error.name === 'AbortError') return 'cancelled'
    throw error
  }
}

/** Use the invoking window's native picker and settle cancellation/closure without changing P-M. */
export function pickSpreadsheetXlsx(view: Window, signal: AbortSignal): Promise<File | null> {
  if (signal.aborted || view.closed) return Promise.resolve(null)
  return new Promise(resolve => {
    const input = view.document.createElement('input')
    input.type = 'file'; input.accept = `.xlsx,${MIME}`; input.hidden = true
    const finish = (file: File | null) => {
      input.remove(); signal.removeEventListener('abort', cancel); view.removeEventListener('pagehide', cancel)
      resolve(file)
    }
    const cancel = () => finish(null)
    input.addEventListener('change', () => finish(input.files?.[0] ?? null), { once: true })
    input.addEventListener('cancel', cancel, { once: true })
    signal.addEventListener('abort', cancel, { once: true }); view.addEventListener('pagehide', cancel, { once: true })
    view.document.body.append(input); input.click()
  })
}
