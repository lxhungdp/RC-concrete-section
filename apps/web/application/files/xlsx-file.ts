const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
type SaveWindow = Window & { showSaveFilePicker?: (options: {
  suggestedName: string; types: { description: string; accept: Record<string, string[]> }[]
}) => Promise<{ createWritable(): Promise<{ write(blob: Blob): Promise<void>; close(): Promise<void>; abort(): Promise<void> }> }> }

/** Pick a destination during the user gesture, then obtain the independent workbook bytes. */
export async function saveSpreadsheetXlsx(fileName: string, getBytes: () => Promise<ArrayBuffer>): Promise<'saved' | 'downloaded' | 'cancelled'> {
  try {
    const picker = (window as SaveWindow).showSaveFilePicker
    const handle = picker ? await picker.call(window, { suggestedName: fileName, types: [{ description: 'Excel workbook', accept: { [MIME]: ['.xlsx'] } }] }) : undefined
    const bytes = await getBytes(), blob = new Blob([bytes], { type: MIME })
    if (handle) {
      const stream = await handle.createWritable()
      try { await stream.write(blob); await stream.close() }
      catch (error) { await stream.abort().catch(() => {}); throw error }
      return 'saved'
    }
    const url = URL.createObjectURL(blob), link = document.createElement('a')
    link.href = url; link.download = fileName
    ;(document.querySelector('dialog[open]') ?? document.body).append(link)
    link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60_000)
    return 'downloaded'
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
    throw error
  }
}
