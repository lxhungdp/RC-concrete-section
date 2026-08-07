/**
 * Report-shaped primitives on top of the raw PDF writer.
 *
 * The split matters: `writer.ts` knows paths and glyphs, this file knows pages, headings, tables
 * and figures, and neither knows anything about columns. A renderer built on these two says what
 * the report contains, not how a table row wraps.
 *
 * Coordinates here are PDF points with y increasing upwards, but the cursor walks *down* the page,
 * because that is how a report is written and read.
 */
import { HELVETICA, HELVETICA_BOLD, measureText, wrapText, type PdfFontId } from './font-metrics'
import type { UnicodeTrueTypeFont } from './unicode-font'
import {
  A4_PORTRAIT,
  PdfDocument,
  PdfPage,
  hex,
  type PdfPageSize,
  type Rgb
} from './writer'

export const REPORT_COLORS = {
  ink: hex('#0f172a'),
  muted: hex('#64748b'),
  hairline: hex('#cbd5e1'),
  rule: hex('#94a3b8'),
  headerFill: hex('#1f3864'),
  bandFill: hex('#e8eef7'),
  zebra: hex('#f5f7fb'),
  accent: hex('#2563eb'),
  nominal: hex('#94a3b8'),
  design: hex('#1d4ed8'),
  demand: hex('#b91c1c'),
  concrete: hex('#cbd5e1'),
  compression: hex('#93c5fd'),
  steel: hex('#334155'),
  good: hex('#15803d'),
  bad: hex('#b91c1c'),
  warn: hex('#b45309'),
  watermark: hex('#e2e8f0')
} as const

export const MARGIN = { left: 42, right: 42, top: 58, bottom: 46 }

export type ReportHeader = {
  title: string
  project: string
  section: string
  /** Shown top-right on every page; also drives the watermark. */
  status: string
  /** Rendered diagonally across every page when set. */
  watermark?: string
  generated: string
}

export type Frame = {
  page: PdfPage
  left: number
  bottom: number
  width: number
  height: number
  /** Model units (mm, kN, kN·m …) to page points. */
  map: (point: { x: number; y: number }) => { x: number; y: number }
  scale: { x: number; y: number }
}

type PageState = {
  page: PdfPage
  size: PdfPageSize
  /** Distance from the top of the page to the next free line. */
  cursor: number
}

export class ReportDocument {
  private readonly doc: PdfDocument
  private readonly header: ReportHeader
  private readonly pages: PageState[] = []
  private state: PageState | null = null

  constructor(header: ReportHeader, title: string, unicodeFontBytes?: Uint8Array) {
    this.header = header
    this.doc = new PdfDocument({
      title,
      author: 'P-M Column Designer',
      subject: `${header.project} — ${header.section}`
    }, unicodeFontBytes)
  }

  get current(): PageState {
    if (!this.state) return this.newPage()
    return this.state
  }

  /** Free height left below the cursor, before the footer band. */
  get remaining() {
    const state = this.current
    return state.size.height - MARGIN.bottom - (state.size.height - state.cursor)
  }

  get pageWidth() {
    return this.current.size.width - MARGIN.left - MARGIN.right
  }

  newPage(size: PdfPageSize = A4_PORTRAIT): PageState {
    const page = this.doc.addPage(size)
    const state: PageState = { page, size, cursor: size.height - MARGIN.top }
    this.pages.push(state)
    this.state = state
    this.drawWatermark(state)
    this.drawHeader(state)
    return state
  }

  /** Start a new page unless `height` still fits below the cursor. */
  ensure(height: number, size?: PdfPageSize) {
    const state = this.current
    if (size && (size.width !== state.size.width || size.height !== state.size.height)) {
      return this.newPage(size)
    }
    if (state.cursor - height < MARGIN.bottom) return this.newPage(state.size)
    return state
  }

  advance(height: number) {
    this.current.cursor -= height
  }

  private drawWatermark(state: PageState) {
    if (!this.header.watermark) return
    const { page, size } = state
    page.save()
    page.text(size.width / 2, size.height / 2 - 60, this.header.watermark, {
      font: HELVETICA_BOLD,
      size: 68,
      color: REPORT_COLORS.watermark,
      align: 'center',
      rotate: 38
    })
    page.restore()
  }

  private drawHeader(state: PageState) {
    const { page, size } = state
    const top = size.height - 30
    page.setFill(REPORT_COLORS.headerFill)
    page.rect(MARGIN.left, top - 2, size.width - MARGIN.left - MARGIN.right, 16, 'fill')
    page.text(MARGIN.left + 6, top + 2, this.header.title, {
      font: HELVETICA_BOLD,
      size: 9,
      color: hex('#ffffff')
    })
    page.text(size.width - MARGIN.right - 6, top + 2, this.header.status, {
      font: HELVETICA_BOLD,
      size: 8,
      color: hex('#ffffff'),
      align: 'right'
    })
    page.text(MARGIN.left, top - 12, `${this.header.project}  ·  ${this.header.section}`, {
      size: 7.5,
      color: REPORT_COLORS.muted
    })
    page.text(size.width - MARGIN.right, top - 12, this.header.generated, {
      size: 7.5,
      color: REPORT_COLORS.muted,
      align: 'right'
    })
  }

  // -------------------------------------------------------------------------
  // Text blocks
  // -------------------------------------------------------------------------

  title(text: string, subtitle?: string) {
    const state = this.ensure(subtitle ? 34 : 24)
    state.page.text(MARGIN.left, state.cursor - 12, text, {
      font: HELVETICA_BOLD,
      size: 13,
      color: REPORT_COLORS.ink
    })
    this.advance(18)
    if (subtitle) {
      state.page.text(MARGIN.left, this.current.cursor - 8, subtitle, {
        size: 8.5,
        color: REPORT_COLORS.muted
      })
      this.advance(14)
    }
  }

  heading(text: string) {
    const state = this.ensure(24)
    const width = state.size.width - MARGIN.left - MARGIN.right
    state.page.setFill(REPORT_COLORS.bandFill)
    state.page.rect(MARGIN.left, state.cursor - 14, width, 14, 'fill')
    state.page.text(MARGIN.left + 5, state.cursor - 10.5, text, {
      font: HELVETICA_BOLD,
      size: 9,
      color: REPORT_COLORS.headerFill
    })
    this.advance(20)
  }

  paragraph(text: string, options: { size?: number; color?: Rgb; font?: PdfFontId } = {}) {
    const size = options.size ?? 8
    const lines = wrapText(text, options.font ?? HELVETICA, size, this.pageWidth, this.doc.unicodeFont)
    for (const line of lines) {
      const state = this.ensure(size + 3)
      state.page.text(MARGIN.left, state.cursor - size, line, {
        size,
        color: options.color ?? REPORT_COLORS.muted,
        font: options.font
      })
      this.advance(size + 3)
    }
    this.advance(3)
  }

  /**
   * Two-column label/value grid.
   *
   * `columns` is how many label+value pairs share a row; the input page uses two so the material
   * block sits beside the geometry block rather than running the length of the sheet.
   */
  keyValues(rows: ReadonlyArray<readonly [string, string]>, columns = 2, width = this.pageWidth) {
    const columnWidth = width / columns
    const labelWidth = columnWidth * 0.44
    const valueWidth = columnWidth - labelWidth - 10
    const lineHeight = 12
    for (let index = 0; index < rows.length; index += columns) {
      const state = this.ensure(lineHeight)
      const y = state.cursor - 8.5
      for (let column = 0; column < columns; column += 1) {
        const entry = rows[index + column]
        if (!entry) continue
        const x = MARGIN.left + column * columnWidth
        state.page.text(x, y, truncate(entry[0], labelWidth - 4, 8, this.doc.unicodeFont), {
          size: 8,
          color: REPORT_COLORS.muted
        })
        // A long value has to be clipped, not allowed to run into the next column: two overlapping
        // numbers are worse than one shortened label.
        state.page.text(x + labelWidth, y, truncate(entry[1], valueWidth, 8, this.doc.unicodeFont), {
          size: 8,
          font: HELVETICA_BOLD,
          color: REPORT_COLORS.ink
        })
      }
      this.advance(lineHeight)
    }
    this.advance(4)
  }

  // -------------------------------------------------------------------------
  // Tables
  // -------------------------------------------------------------------------

  table(spec: {
    columns: ReadonlyArray<{ title: string; width: number; align?: 'left' | 'right' | 'center' }>
    rows: ReadonlyArray<ReadonlyArray<string>>
    /** Per-row text colour; used to mark an inadequate combination without a second column. */
    rowColor?: (rowIndex: number) => Rgb | undefined
    size?: number
    zebra?: boolean
  }) {
    const size = spec.size ?? 7.5
    const rowHeight = size + 6
    const headerHeight = size + 8
    const total = spec.columns.reduce((sum, column) => sum + column.width, 0)
    const scale = this.pageWidth / total

    const drawHeader = () => {
      const state = this.ensure(headerHeight + rowHeight)
      state.page.setFill(REPORT_COLORS.headerFill)
      state.page.rect(MARGIN.left, state.cursor - headerHeight, this.pageWidth, headerHeight, 'fill')
      let x = MARGIN.left
      for (const column of spec.columns) {
        const columnWidth = column.width * scale
        const anchor =
          column.align === 'right' ? x + columnWidth - 4 : column.align === 'center' ? x + columnWidth / 2 : x + 4
        state.page.text(anchor, state.cursor - headerHeight + 4.5, column.title, {
          font: HELVETICA_BOLD,
          size: size - 0.5,
          color: hex('#ffffff'),
          align: column.align === 'right' ? 'right' : column.align === 'center' ? 'center' : 'left'
        })
        x += columnWidth
      }
      this.advance(headerHeight)
    }

    drawHeader()
    spec.rows.forEach((row, rowIndex) => {
      let state = this.current
      if (state.cursor - rowHeight < MARGIN.bottom) {
        this.newPage(state.size)
        drawHeader()
        state = this.current
      }
      const top = state.cursor
      if (spec.zebra !== false && rowIndex % 2 === 1) {
        state.page.setFill(REPORT_COLORS.zebra)
        state.page.rect(MARGIN.left, top - rowHeight, this.pageWidth, rowHeight, 'fill')
      }
      let x = MARGIN.left
      const color = spec.rowColor?.(rowIndex) ?? REPORT_COLORS.ink
      row.forEach((cell, columnIndex) => {
        const column = spec.columns[columnIndex]
        if (!column) return
        const columnWidth = column.width * scale
        const anchor =
          column.align === 'right' ? x + columnWidth - 4 : column.align === 'center' ? x + columnWidth / 2 : x + 4
        state.page.text(anchor, top - rowHeight + 4, truncate(cell, columnWidth - 8, size, this.doc.unicodeFont), {
          size,
          color,
          align: column.align === 'right' ? 'right' : column.align === 'center' ? 'center' : 'left'
        })
        x += columnWidth
      })
      state.page.setStroke(REPORT_COLORS.hairline)
      state.page.setLineWidth(0.3)
      state.page.line(MARGIN.left, top - rowHeight, MARGIN.left + this.pageWidth, top - rowHeight)
      this.advance(rowHeight)
    })
    this.advance(6)
  }

  // -------------------------------------------------------------------------
  // Figures
  // -------------------------------------------------------------------------

  /**
   * Reserve a titled box and hand back a coordinate frame fitted to `bounds`.
   *
   * The frame preserves aspect ratio when asked to, because a column cross-section drawn to two
   * different scales in x and y is not a drawing of that column.
   */
  figure(options: {
    title: string
    height: number
    bounds: { minX: number; maxX: number; minY: number; maxY: number }
    /** Fraction of the text width; 1 is full width. */
    widthFraction?: number
    /** Horizontal offset as a fraction of the text width; use with `widthFraction` for side-by-side. */
    offsetFraction?: number
    preserveAspect?: boolean
    padding?: number
    caption?: string
  }): Frame {
    const state = this.ensure(options.height + 16)
    const boxWidth = this.pageWidth * (options.widthFraction ?? 1)
    const boxLeft = MARGIN.left + this.pageWidth * (options.offsetFraction ?? 0)
    const boxTop = state.cursor
    const boxBottom = boxTop - options.height

    state.page.setStroke(REPORT_COLORS.hairline)
    state.page.setLineWidth(0.5)
    state.page.rect(boxLeft, boxBottom, boxWidth, options.height, 'stroke')
    state.page.text(boxLeft + 5, boxTop - 9.5, options.title, {
      font: HELVETICA_BOLD,
      size: 7.5,
      color: REPORT_COLORS.headerFill
    })
    /**
     * The caption is a legend, so it belongs on the title line rather than under the plot: the
     * bottom edge is where axis tick labels live, and the two collided there.
     */
    if (options.caption) {
      const free = boxWidth - measureText(options.title, HELVETICA_BOLD, 7.5, this.doc.unicodeFont) - 18
      const caption = truncate(options.caption, free, 6.5, this.doc.unicodeFont)
      if (caption.length > 1) {
        state.page.text(boxLeft + boxWidth - 5, boxTop - 9.5, caption, {
          size: 6.5,
          color: REPORT_COLORS.muted,
          align: 'right'
        })
      }
    }

    const padding = options.padding ?? 12
    const plotLeft = boxLeft + padding
    // Extra bottom room for the axis label under the tick row, extra top room for the title band.
    const plotBottom = boxBottom + padding + 12
    const plotWidth = boxWidth - 2 * padding
    const plotHeight = options.height - 2 * padding - 24

    const spanX = Math.max(1e-9, options.bounds.maxX - options.bounds.minX)
    const spanY = Math.max(1e-9, options.bounds.maxY - options.bounds.minY)
    let scaleX = plotWidth / spanX
    let scaleY = plotHeight / spanY
    if (options.preserveAspect !== false) {
      const uniform = Math.min(scaleX, scaleY)
      scaleX = uniform
      scaleY = uniform
    }
    const drawnWidth = spanX * scaleX
    const drawnHeight = spanY * scaleY
    const originX = plotLeft + (plotWidth - drawnWidth) / 2
    const originY = plotBottom + (plotHeight - drawnHeight) / 2

    const frame: Frame = {
      page: state.page,
      left: plotLeft,
      bottom: plotBottom,
      width: plotWidth,
      height: plotHeight,
      scale: { x: scaleX, y: scaleY },
      map: (point) => ({
        x: originX + (point.x - options.bounds.minX) * scaleX,
        y: originY + (point.y - options.bounds.minY) * scaleY
      })
    }

    // Only advance when the figure occupies the full width; a half-width figure leaves the cursor
    // where it is so a sibling can be placed beside it, and the caller advances once.
    if ((options.widthFraction ?? 1) >= 0.999) this.advance(options.height + 8)
    return frame
  }

  /** Close the figure row started by half-width figures. */
  endFigureRow(height: number) {
    this.advance(height + 8)
  }

  // -------------------------------------------------------------------------
  // Output
  // -------------------------------------------------------------------------

  /** Stamps `Page i of N` — only knowable now — and serialises. */
  finish(): Uint8Array {
    const total = this.pages.length
    this.pages.forEach((state, index) => {
      const { page, size } = state
      page.setStroke(REPORT_COLORS.hairline)
      page.setLineWidth(0.5)
      page.line(MARGIN.left, MARGIN.bottom - 10, size.width - MARGIN.right, MARGIN.bottom - 10)
      page.text(MARGIN.left, MARGIN.bottom - 20, this.header.status, {
        size: 7,
        color: REPORT_COLORS.muted
      })
      page.text(size.width - MARGIN.right, MARGIN.bottom - 20, `Page ${index + 1} of ${total}`, {
        size: 7,
        color: REPORT_COLORS.muted,
        align: 'right'
      })
    })
    return this.doc.serialize()
  }
}

const truncate = (text: string, width: number, size: number, unicodeFont?: UnicodeTrueTypeFont) => {
  if (width <= 0) return ''
  if (measureText(text, HELVETICA, size, unicodeFont) <= width) return text
  let result = text
  while (result.length > 1 && measureText(`${result}…`, HELVETICA, size, unicodeFont) > width) {
    result = result.slice(0, -1)
  }
  return `${result}…`
}
