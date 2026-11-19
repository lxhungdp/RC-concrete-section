/**
 * Minimal read-only TrueType adapter for the report's embedded Unicode fallback.
 *
 * The PDF writer needs only cmap (Unicode -> glyph), hmtx (advance widths), and global metrics.
 * Keeping that narrow contract avoids a runtime font dependency while still emitting a standard
 * Type0/CIDFontType2 font with a ToUnicode map for searchable, copyable report text.
 */

type Table = { offset: number; length: number }

const tagAt = (bytes: Uint8Array, offset: number) =>
  String.fromCharCode(bytes[offset]!, bytes[offset + 1]!, bytes[offset + 2]!, bytes[offset + 3]!)

const hex4 = (value: number) => value.toString(16).toUpperCase().padStart(4, '0')

const unicodeHex = (codePoint: number) => {
  const text = String.fromCodePoint(codePoint)
  let result = ''
  for (let index = 0; index < text.length; index += 1) result += hex4(text.charCodeAt(index))
  return result
}

export class UnicodeTrueTypeFont {
  readonly bytes: Uint8Array
  readonly unitsPerEm: number
  readonly ascent: number
  readonly descent: number
  readonly capHeight: number
  readonly bbox: readonly [number, number, number, number]

  private readonly view: DataView
  private readonly tables: Map<string, Table>
  private readonly cmapOffset: number
  private readonly cmapFormat: 4 | 12
  private readonly hmtxOffset: number
  private readonly numberOfHMetrics: number
  private readonly numGlyphs: number
  private readonly mappings = new Map<number, number>()

  constructor(source: Uint8Array) {
    this.bytes = source.slice()
    this.view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength)
    this.tables = this.readTables()

    const head = this.table('head')
    const hhea = this.table('hhea')
    const maxp = this.table('maxp')
    const hmtx = this.table('hmtx')
    this.unitsPerEm = this.u16(head.offset + 18)
    if (this.unitsPerEm <= 0) throw new Error('Unicode report font has an invalid unitsPerEm value.')
    this.ascent = this.scale(this.i16(hhea.offset + 4))
    this.descent = this.scale(this.i16(hhea.offset + 6))
    this.capHeight = this.ascent
    this.bbox = [
      this.scale(this.i16(head.offset + 36)),
      this.scale(this.i16(head.offset + 38)),
      this.scale(this.i16(head.offset + 40)),
      this.scale(this.i16(head.offset + 42))
    ]
    this.numberOfHMetrics = this.u16(hhea.offset + 34)
    this.numGlyphs = this.u16(maxp.offset + 4)
    this.hmtxOffset = hmtx.offset
    if (this.numberOfHMetrics <= 0 || this.numberOfHMetrics > this.numGlyphs) {
      throw new Error('Unicode report font has invalid horizontal metrics.')
    }

    const cmap = this.selectCmap()
    this.cmapOffset = cmap.offset
    this.cmapFormat = cmap.format
  }

  get used() {
    return this.mappings.size > 0
  }

  glyphForCodePoint(codePoint: number): number | null {
    const glyph = this.cmapFormat === 12
      ? this.glyphFromFormat12(codePoint)
      : this.glyphFromFormat4(codePoint)
    if (glyph === 0 || glyph >= this.numGlyphs) return null
    this.mappings.set(glyph, codePoint)
    return glyph
  }

  widthForGlyph(glyph: number) {
    const metric = Math.min(glyph, this.numberOfHMetrics - 1)
    return this.scale(this.u16(this.hmtxOffset + metric * 4))
  }

  encodedGlyphs(glyphs: readonly number[]) {
    return glyphs.map(hex4).join('')
  }

  pdfWidths() {
    return [...this.mappings.keys()]
      .sort((left, right) => left - right)
      .map((glyph) => `${glyph} [${this.widthForGlyph(glyph)}]`)
      .join(' ')
  }

  toUnicodeCMap() {
    const entries = [...this.mappings.entries()].sort((left, right) => left[0] - right[0])
    const blocks: string[] = []
    for (let index = 0; index < entries.length; index += 100) {
      const block = entries.slice(index, index + 100)
      blocks.push(
        `${block.length} beginbfchar\n` +
        block.map(([glyph, codePoint]) => `<${hex4(glyph)}> <${unicodeHex(codePoint)}>`).join('\n') +
        '\nendbfchar'
      )
    }
    return [
      '/CIDInit /ProcSet findresource begin',
      '12 dict begin',
      'begincmap',
      '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
      '/CMapName /PMReportUnicode-UCS def',
      '/CMapType 2 def',
      '1 begincodespacerange',
      '<0000> <FFFF>',
      'endcodespacerange',
      ...blocks,
      'endcmap',
      'CMapName currentdict /CMap defineresource pop',
      'end',
      'end'
    ].join('\n')
  }

  private scale(value: number) {
    return Math.round((value * 1000) / this.unitsPerEm)
  }

  private readTables() {
    if (this.bytes.byteLength < 12) throw new Error('Unicode report font is truncated.')
    const tables = new Map<string, Table>()
    const count = this.u16(4)
    for (let index = 0; index < count; index += 1) {
      const record = 12 + index * 16
      const tag = tagAt(this.bytes, record)
      const offset = this.u32(record + 8)
      const length = this.u32(record + 12)
      if (offset + length > this.bytes.byteLength) throw new Error(`Unicode report font table ${tag} is truncated.`)
      tables.set(tag, { offset, length })
    }
    return tables
  }

  private table(tag: string) {
    const table = this.tables.get(tag)
    if (!table) throw new Error(`Unicode report font is missing its ${tag} table.`)
    return table
  }

  private selectCmap(): { offset: number; format: 4 | 12 } {
    const cmap = this.table('cmap')
    const records = this.u16(cmap.offset + 2)
    let selected: { offset: number; format: 4 | 12; score: number } | null = null
    for (let index = 0; index < records; index += 1) {
      const record = cmap.offset + 4 + index * 8
      const platform = this.u16(record)
      const encoding = this.u16(record + 2)
      const offset = cmap.offset + this.u32(record + 4)
      const format = this.u16(offset)
      if (format !== 4 && format !== 12) continue
      const score = format === 12
        ? platform === 3 && encoding === 10 ? 100 : platform === 0 ? 90 : 70
        : platform === 3 && encoding === 1 ? 60 : platform === 0 ? 50 : 30
      if (!selected || score > selected.score) selected = { offset, format, score }
    }
    if (!selected) throw new Error('Unicode report font has no supported Unicode cmap.')
    return selected
  }

  private glyphFromFormat12(codePoint: number) {
    const groups = this.u32(this.cmapOffset + 12)
    let low = 0
    let high = groups - 1
    while (low <= high) {
      const middle = Math.floor((low + high) / 2)
      const offset = this.cmapOffset + 16 + middle * 12
      const start = this.u32(offset)
      const end = this.u32(offset + 4)
      if (codePoint < start) high = middle - 1
      else if (codePoint > end) low = middle + 1
      else return this.u32(offset + 8) + codePoint - start
    }
    return 0
  }

  private glyphFromFormat4(codePoint: number) {
    if (codePoint > 0xffff) return 0
    const segments = this.u16(this.cmapOffset + 6) / 2
    const endCodes = this.cmapOffset + 14
    const startCodes = endCodes + segments * 2 + 2
    const deltas = startCodes + segments * 2
    const rangeOffsets = deltas + segments * 2
    for (let index = 0; index < segments; index += 1) {
      const end = this.u16(endCodes + index * 2)
      if (codePoint > end) continue
      const start = this.u16(startCodes + index * 2)
      if (codePoint < start) return 0
      const delta = this.i16(deltas + index * 2)
      const rangeOffsetPosition = rangeOffsets + index * 2
      const rangeOffset = this.u16(rangeOffsetPosition)
      if (rangeOffset === 0) return (codePoint + delta) & 0xffff
      const glyph = this.u16(rangeOffsetPosition + rangeOffset + (codePoint - start) * 2)
      return glyph === 0 ? 0 : (glyph + delta) & 0xffff
    }
    return 0
  }

  private u16(offset: number) {
    return this.view.getUint16(offset, false)
  }

  private i16(offset: number) {
    return this.view.getInt16(offset, false)
  }

  private u32(offset: number) {
    return this.view.getUint32(offset, false)
  }
}
