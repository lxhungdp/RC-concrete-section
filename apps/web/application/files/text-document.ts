export type TextGroup = { title: string; rows: readonly (readonly [string, string])[] }
export type TextDocument = { title: string; groups: readonly TextGroup[]; notes?: readonly string[] }

/** Presentation strings only; retain units, Unicode and unavailable markers verbatim. */
export const formatTextDocument = ({ title, groups, notes = [] }: TextDocument): string => {
  const lines = ['P-M Column Designer — PREVIEW', title, '='.repeat(72)]
  for (const group of groups) {
    if (!group.rows.length) continue
    lines.push('', group.title, '-'.repeat(Math.min(group.title.length, 72)))
    const width = Math.min(32, Math.max(...group.rows.map(([label]) => label.length)))
    for (const [label, value] of group.rows) {
      lines.push(`${label.padEnd(width)} : ${value.replace(/\r?\n/g, '\n' + ' '.repeat(width + 3))}`)
    }
  }
  if (notes.length) lines.push('', 'Notes', '-----', ...notes.map(note => `• ${note}`))
  return lines.join('\n') + '\n'
}

export const textFileName = (name: string) => `Demand-${name}`
  .replace(/[<>:"/\\|?*\u0000-\u001f]/gu, '_').slice(0, 160).replace(/[. ]+$/gu, '') + '.txt'

type SaveWindow = Window & { showSaveFilePicker?: (options: {
  suggestedName: string; types: { description: string; accept: Record<string, string[]> }[]
}) => Promise<{ createWritable(): Promise<{ write(blob: Blob): Promise<void>; close(): Promise<void>; abort(): Promise<void> }> }> }

/** Save the exact snapshot on an explicit user action; cancellation never starts a download. */
export const saveTextDocument = async (name: string, text: string): Promise<'saved' | 'downloaded' | 'cancelled'> => {
  const view = window as SaveWindow
  const fileName = textFileName(name), blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  try {
    if (view.showSaveFilePicker) {
      const handle = await view.showSaveFilePicker({ suggestedName: fileName,
        types: [{ description: 'Text file', accept: { 'text/plain': ['.txt'] } }] })
      const stream = await handle.createWritable()
      try { await stream.write(blob); await stream.close() }
      catch (error) { await stream.abort().catch(() => {}); throw error }
      return 'saved'
    }
    const url = URL.createObjectURL(blob), link = document.createElement('a')
    link.href = url; link.download = fileName
    ;(document.querySelector('dialog[open]') ?? document.body).append(link)
    link.click(); link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    return 'downloaded'
  } catch (error) {
    if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') return 'cancelled'
    throw error
  }
}
