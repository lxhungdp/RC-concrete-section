/** Shared XLSX preflight, before a ZIP reader allocates expanded workbook content. */
export const WORKBOOK_MAX_BYTES = 10 * 1024 * 1024
const MAX_EXPANDED_BYTES = 64 * 1024 * 1024
export type WorkbookArchiveIssue = { code: 'WORKBOOK_FORMAT' | 'WORKBOOK_RESOURCE_LIMIT'; message: string }

export function inspectWorkbookArchive(buffer: ArrayBuffer, label = 'Workbook'): WorkbookArchiveIssue | null {
  const fail = (code: WorkbookArchiveIssue['code'], message: string): WorkbookArchiveIssue => ({ code, message })
  if (buffer.byteLength > WORKBOOK_MAX_BYTES) return fail('WORKBOOK_RESOURCE_LIMIT', `${label} exceeds 10 MiB.`)
  const view = new DataView(buffer)
  let end = -1
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === buffer.byteLength) { end = i; break }
  }
  if (end < 0) return fail('WORKBOOK_FORMAT', 'Invalid XLSX ZIP archive.')
  const count = view.getUint16(end + 10, true)
  if (view.getUint16(end + 4, true) !== 0 || view.getUint16(end + 6, true) !== 0 || view.getUint16(end + 8, true) !== count) return fail('WORKBOOK_FORMAT', 'Multi-disk ZIP archives are unsupported.')
  if (count > 256) return fail('WORKBOOK_RESOURCE_LIMIT', `${label} exceeds 256 ZIP entries.`)
  let offset = view.getUint32(end + 16, true), expanded = 0
  const directoryEnd = offset + view.getUint32(end + 12, true)
  if (directoryEnd !== end) return fail('WORKBOOK_FORMAT', 'Unsupported or malformed XLSX ZIP directory.')
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) return fail('WORKBOOK_FORMAT', 'Malformed XLSX ZIP entry.')
    expanded += view.getUint32(offset + 24, true)
    if (expanded > MAX_EXPANDED_BYTES) return fail('WORKBOOK_RESOURCE_LIMIT', `${label} exceeds 64 MiB expanded content.`)
    offset += 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true)
  }
  return offset === directoryEnd ? null : fail('WORKBOOK_FORMAT', 'Malformed XLSX ZIP directory length.')
}
