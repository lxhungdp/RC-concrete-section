import { DRAWING_LIMITS, type DrawingResult } from './section-dxf'

/** Reject native drawing formats before passing text to the section DXF codec. */
export const readSectionDrawingBytes = (
  bytes: ArrayBuffer, name: string
): DrawingResult<string> => {
  if (bytes.byteLength > DRAWING_LIMITS.bytes) return {
    ok: false, issue: { code: 'RESOURCE_LIMIT', message: 'Drawing exceeds the 10 MiB file limit.' }
  }
  const extension = name.split('.').pop()?.toLowerCase()
  const prefix = new TextDecoder().decode(bytes.slice(0, 24))
  const nativeDwg = /^AC10\d{2}/.test(prefix)
  if (extension === 'dwg' || nativeDwg) return { ok: false, issue: {
    code: 'FORMAT', message: 'DWG import is unavailable in this browser app. Save the drawing as ASCII DXF (.dxf) in ZWCAD, then import that file.'
  } }
  if (extension !== 'dxf') return { ok: false, issue: { code: 'FORMAT', message: 'Select an ASCII DXF (.dxf) drawing.' } }
  if (prefix.startsWith('AutoCAD Binary DXF')) return {
    ok: false, issue: { code: 'FORMAT', message: 'Binary DXF is unsupported. Save an ASCII DXF (.dxf) drawing from CAD instead.' }
  }
  return { ok: true, value: new TextDecoder().decode(bytes), warnings: [] }
}

export const readSectionDrawingFile = async (file: File): Promise<DrawingResult<string>> => {
  if (file.size > DRAWING_LIMITS.bytes) return {
    ok: false, issue: { code: 'RESOURCE_LIMIT', message: 'Drawing exceeds the 10 MiB file limit.' }
  }
  return readSectionDrawingBytes(await file.arrayBuffer(), file.name)
}
