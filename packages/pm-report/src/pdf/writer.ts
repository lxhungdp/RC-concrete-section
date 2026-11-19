/**
 * Minimal, deterministic PDF writer.
 *
 * Written by hand for the same reason `mesh-export.ts` writes DXF R12 by hand: the output is an
 * audit artifact, so broad reader compatibility and byte-level predictability matter more than
 * document-model features. Concretely this buys three things a general PDF library does not:
 *
 *   - **Determinism.** Fixed object ordering, a stable Unicode font asset, no compression dictionary,
 *     and no creation timestamp unless the caller supplies one. The same model produces the same
 *     bytes, which is what makes a result-identity hash over the file meaningful.
 *   - **Vector output.** Section drawings and interaction diagrams are paths and text, not a
 *     rasterised canvas, so labels stay selectable and legible at any zoom.
 *   - **No runtime PDF dependency.** The web app loads the fallback TTF only during report export.
 *
 * The trade is that layout is our problem. `layout.ts` builds the report primitives on top; this
 * file knows only about pages, paths, colours and text.
 */
import {
  HELVETICA,
  measureText,
  splitTextRuns,
  UNICODE,
  type PdfFontId
} from './font-metrics'
import { UnicodeTrueTypeFont } from './unicode-font'

export type Rgb = { r: number; g: number; b: number }

export type PdfPageSize = { width: number; height: number }

/** A4 portrait and landscape in PDF points (1/72 in). */
export const A4_PORTRAIT: PdfPageSize = { width: 595.28, height: 841.89 }
export const A4_LANDSCAPE: PdfPageSize = { width: 841.89, height: 595.28 }

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

export const rgb = (r: number, g: number, b: number): Rgb => ({
  r: clamp01(r),
  g: clamp01(g),
  b: clamp01(b)
})

/** `#rrggbb` to the 0-1 triple PDF wants. Accepts the same literals the UI palette uses. */
export const hex = (value: string): Rgb => {
  const text = value.replace('#', '')
  const full = text.length === 3 ? [...text].map((c) => c + c).join('') : text
  return rgb(
    parseInt(full.slice(0, 2), 16) / 255,
    parseInt(full.slice(2, 4), 16) / 255,
    parseInt(full.slice(4, 6), 16) / 255
  )
}

/** Six significant digits: enough for 1/1000 pt, short enough to keep streams readable. */
const num = (value: number) => {
  if (!Number.isFinite(value)) return '0'
  const rounded = Math.round(value * 1000) / 1000
  return Object.is(rounded, -0) ? '0' : String(rounded)
}

const hex4 = (value: number) => value.toString(16).toUpperCase().padStart(4, '0')

const escapeCodes = (codes: readonly number[]) => {
  let out = ''
  for (const code of codes) {
    if (code === 0x28 || code === 0x29 || code === 0x5c) out += `\\${String.fromCharCode(code)}`
    else if (code < 32 || code > 126) out += `\\${code.toString(8).padStart(3, '0')}`
    else out += String.fromCharCode(code)
  }
  return out
}

const latin1Bytes = (value: string) => {
  const bytes = new Uint8Array(value.length)
  for (let index = 0; index < value.length; index += 1) bytes[index] = value.charCodeAt(index) & 0xff
  return bytes
}

const concatenateBytes = (parts: readonly Uint8Array[]) => {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0))
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.byteLength
  }
  return result
}

const binaryStream = (bytes: Uint8Array, entries = '') => concatenateBytes([
  latin1Bytes(`<< /Length ${bytes.byteLength}${entries ? ` ${entries}` : ''} >>\nstream\n`),
  bytes,
  latin1Bytes('\nendstream')
])

export type TextOptions = {
  font?: PdfFontId
  size?: number
  color?: Rgb
  /** Horizontal placement of `x`: where the string sits relative to it. */
  align?: 'left' | 'center' | 'right'
  /** Rotation in degrees, counter-clockwise about (x, y). */
  rotate?: number
}

export class PdfPage {
  readonly size: PdfPageSize
  private readonly parts: string[] = []
  private readonly unicodeFont?: UnicodeTrueTypeFont

  constructor(size: PdfPageSize, unicodeFont?: UnicodeTrueTypeFont) {
    this.size = size
    this.unicodeFont = unicodeFont
  }

  /** Raw content-stream escape hatch; used by the drawing helpers below. */
  private op(line: string) {
    this.parts.push(line)
  }

  save() {
    this.op('q')
  }

  restore() {
    this.op('Q')
  }

  setFill(color: Rgb) {
    this.op(`${num(color.r)} ${num(color.g)} ${num(color.b)} rg`)
  }

  setStroke(color: Rgb) {
    this.op(`${num(color.r)} ${num(color.g)} ${num(color.b)} RG`)
  }

  setLineWidth(width: number) {
    this.op(`${num(width)} w`)
  }

  /** Empty array restores a solid line. */
  setDash(pattern: number[], phase = 0) {
    this.op(`[${pattern.map(num).join(' ')}] ${num(phase)} d`)
  }

  rect(x: number, y: number, width: number, height: number, mode: 'fill' | 'stroke' | 'both' = 'stroke') {
    this.op(`${num(x)} ${num(y)} ${num(width)} ${num(height)} re`)
    this.op(mode === 'fill' ? 'f' : mode === 'both' ? 'B' : 'S')
  }

  line(x1: number, y1: number, x2: number, y2: number) {
    this.op(`${num(x1)} ${num(y1)} m ${num(x2)} ${num(y2)} l S`)
  }

  polyline(points: ReadonlyArray<{ x: number; y: number }>, close = false) {
    if (points.length < 2) return
    this.path(points, close)
    this.op('S')
  }

  polygon(
    points: ReadonlyArray<{ x: number; y: number }>,
    mode: 'fill' | 'stroke' | 'both' = 'fill'
  ) {
    if (points.length < 3) return
    this.path(points, true)
    this.op(mode === 'fill' ? 'f' : mode === 'both' ? 'B' : 'S')
  }

  /**
   * Fill an outer ring with holes punched out.
   *
   * Even-odd fill (`f*`) rather than nonzero, so a hole cancels the outer ring regardless of which
   * way the source polygon happens to wind — geometry imported from a drawing has no guaranteed
   * orientation.
   */
  polygonWithHoles(
    outer: ReadonlyArray<{ x: number; y: number }>,
    holes: ReadonlyArray<ReadonlyArray<{ x: number; y: number }>>
  ) {
    if (outer.length < 3) return
    this.path(outer, true)
    for (const hole of holes) {
      if (hole.length >= 3) this.path(hole, true)
    }
    this.op('f*')
  }

  circle(cx: number, cy: number, radius: number, mode: 'fill' | 'stroke' | 'both' = 'fill') {
    // Four cubic segments; the 0.5523 control-point ratio is the standard circle approximation.
    const k = radius * 0.5522847498
    this.op(`${num(cx + radius)} ${num(cy)} m`)
    this.op(`${num(cx + radius)} ${num(cy + k)} ${num(cx + k)} ${num(cy + radius)} ${num(cx)} ${num(cy + radius)} c`)
    this.op(`${num(cx - k)} ${num(cy + radius)} ${num(cx - radius)} ${num(cy + k)} ${num(cx - radius)} ${num(cy)} c`)
    this.op(`${num(cx - radius)} ${num(cy - k)} ${num(cx - k)} ${num(cy - radius)} ${num(cx)} ${num(cy - radius)} c`)
    this.op(`${num(cx + k)} ${num(cy - radius)} ${num(cx + radius)} ${num(cy - k)} ${num(cx + radius)} ${num(cy)} c`)
    this.op('h')
    this.op(mode === 'fill' ? 'f' : mode === 'both' ? 'B' : 'S')
  }

  /** Clip every later operation until the matching `restore()` to this rectangle. */
  clipRect(x: number, y: number, width: number, height: number) {
    this.op(`${num(x)} ${num(y)} ${num(width)} ${num(height)} re W n`)
  }

  private path(points: ReadonlyArray<{ x: number; y: number }>, close: boolean) {
    this.op(`${num(points[0].x)} ${num(points[0].y)} m`)
    for (let index = 1; index < points.length; index += 1) {
      this.op(`${num(points[index].x)} ${num(points[index].y)} l`)
    }
    if (close) this.op('h')
  }

  text(x: number, y: number, value: string, options: TextOptions = {}) {
    const font = options.font ?? HELVETICA
    const size = options.size ?? 9
    const runs = splitTextRuns(value, font, this.unicodeFont)
    if (runs.length === 0) return
    const width = measureText(value, font, size, this.unicodeFont)
    const offset = options.align === 'center' ? -width / 2 : options.align === 'right' ? -width : 0

    this.save()
    if (options.color) this.setFill(options.color)
    this.op('BT')
    if (options.rotate) {
      const radians = (options.rotate * Math.PI) / 180
      const cos = Math.cos(radians)
      const sin = Math.sin(radians)
      // Rotate about (x, y), then step along the rotated baseline by the alignment offset.
      const dx = x + offset * cos
      const dy = y + offset * sin
      this.op(`${num(cos)} ${num(sin)} ${num(-sin)} ${num(cos)} ${num(dx)} ${num(dy)} Tm`)
    } else {
      this.op(`1 0 0 1 ${num(x + offset)} ${num(y)} Tm`)
    }
    for (const run of runs) {
      this.op(`/${run.font} ${num(size)} Tf`)
      this.op(
        run.font === UNICODE
          ? `<${this.unicodeFont!.encodedGlyphs(run.codes)}> Tj`
          : `(${escapeCodes(run.codes)}) Tj`
      )
    }
    this.op('ET')
    this.restore()
  }

  stream() {
    return this.parts.join('\n')
  }
}

export type PdfDocumentInfo = {
  title: string
  author: string
  subject: string
  /** Omit for byte-identical output across runs; supply only when a timestamp is wanted. */
  createdAt?: Date
}

export class PdfDocument {
  private readonly pages: PdfPage[] = []
  private readonly info: PdfDocumentInfo
  readonly unicodeFont?: UnicodeTrueTypeFont

  constructor(info: PdfDocumentInfo, unicodeFontBytes?: Uint8Array) {
    this.info = info
    this.unicodeFont = unicodeFontBytes ? new UnicodeTrueTypeFont(unicodeFontBytes) : undefined
  }

  addPage(size: PdfPageSize = A4_PORTRAIT) {
    const page = new PdfPage(size, this.unicodeFont)
    this.pages.push(page)
    return page
  }

  get pageCount() {
    return this.pages.length
  }

  /**
   * Serialise to a complete PDF 1.4 file.
   *
   * Object numbering is fixed by construction, including optional Unicode font objects, so two
   * runs over the same content produce identical bytes.
   */
  serialize(): Uint8Array {
    const objects: Array<string | Uint8Array> = []
    const add = (body: string | Uint8Array) => {
      objects.push(body)
      return objects.length // 1-based object number
    }

    const catalogId = add('<< /Type /Catalog /Pages 2 0 R >>')
    const pagesId = add('') // placeholder, filled once page ids are known
    const fontIds = {
      F1: add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),
      F2: add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'),
      // Symbol carries its own built-in encoding; naming WinAnsi here would remap the Greek glyphs.
      F3: this.unicodeFont
        ? undefined
        : add('<< /Type /Font /Subtype /Type1 /BaseFont /Symbol >>'),
      F4: undefined as number | undefined
    }

    if (this.unicodeFont?.used) {
      const fontFileId = add(binaryStream(
        this.unicodeFont.bytes,
        `/Length1 ${this.unicodeFont.bytes.byteLength}`
      ))
      const [xMin, yMin, xMax, yMax] = this.unicodeFont.bbox
      const descriptorId = add(
        '<< /Type /FontDescriptor /FontName /PMReportUnicode-Regular /Flags 4 ' +
        `/FontBBox [${xMin} ${yMin} ${xMax} ${yMax}] /ItalicAngle 0 ` +
        `/Ascent ${this.unicodeFont.ascent} /Descent ${this.unicodeFont.descent} ` +
        `/CapHeight ${this.unicodeFont.capHeight} /StemV 80 /FontFile2 ${fontFileId} 0 R >>`
      )
      const cidFontId = add(
        '<< /Type /Font /Subtype /CIDFontType2 /BaseFont /PMReportUnicode-Regular ' +
        '/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> ' +
        `/FontDescriptor ${descriptorId} 0 R /DW 1000 /W [${this.unicodeFont.pdfWidths()}] ` +
        '/CIDToGIDMap /Identity >>'
      )
      const cmap = this.unicodeFont.toUnicodeCMap()
      const cmapId = add(`<< /Length ${cmap.length} >>\nstream\n${cmap}\nendstream`)
      fontIds.F4 = add(
        '<< /Type /Font /Subtype /Type0 /BaseFont /PMReportUnicode-Regular ' +
        `/Encoding /Identity-H /DescendantFonts [${cidFontId} 0 R] /ToUnicode ${cmapId} 0 R >>`
      )
    }

    const fontResources =
      `/F1 ${fontIds.F1} 0 R /F2 ${fontIds.F2} 0 R` +
      (!this.unicodeFont ? ` /F3 ${fontIds.F3!} 0 R` : '') +
      (fontIds.F4 ? ` /F4 ${fontIds.F4} 0 R` : '')

    const pageIds: number[] = []
    for (const page of this.pages) {
      const stream = page.stream()
      const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
      const pageId = add(
        `<< /Type /Page /Parent ${pagesId} 0 R ` +
          `/MediaBox [0 0 ${num(page.size.width)} ${num(page.size.height)}] ` +
          `/Resources << /Font << ${fontResources} >> >> ` +
          `/Contents ${contentId} 0 R >>`
      )
      pageIds.push(pageId)
    }
    objects[pagesId - 1] =
      `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`

    const infoParts = [
      `/Title ${pdfTextString(this.info.title)}`,
      `/Author ${pdfTextString(this.info.author)}`,
      `/Subject ${pdfTextString(this.info.subject)}`,
      '/Producer (P-M Column Designer)',
      ...(this.info.createdAt ? [`/CreationDate (${pdfDate(this.info.createdAt)})`] : [])
    ]
    const infoId = add(`<< ${infoParts.join(' ')} >>`)

    const chunks: Uint8Array[] = []
    let length = 0
    const append = (part: string | Uint8Array) => {
      const bytes = typeof part === 'string' ? latin1Bytes(part) : part
      chunks.push(bytes)
      length += bytes.byteLength
    }
    append('%PDF-1.4\n')
    const offsets: number[] = []
    objects.forEach((object, index) => {
      offsets.push(length)
      append(`${index + 1} 0 obj\n`)
      append(object)
      append('\nendobj\n')
    })
    const xrefOffset = length
    append(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`)
    for (const offset of offsets) append(`${String(offset).padStart(10, '0')} 00000 n \n`)
    append(`trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\n`)
    append(`startxref\n${xrefOffset}\n%%EOF\n`)
    return concatenateBytes(chunks)
  }
}

const escapeAscii = (value: string) => value.replace(/[()\\]/g, (character) => `\\${character}`)

const pdfTextString = (value: string) => {
  if ([...value].every((character) => {
    const code = character.codePointAt(0) ?? 0
    return code >= 32 && code <= 126
  })) return `(${escapeAscii(value)})`
  let hex = 'FEFF'
  for (let index = 0; index < value.length; index += 1) hex += hex4(value.charCodeAt(index))
  return `<${hex}>`
}

const pdfDate = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, '0')
  return (
    `D:${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  )
}
