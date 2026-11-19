/**
 * How every exported sheet is laid out.
 *
 * A sheet is a stack of blocks. A block is a heading, a header row and a body, all starting at
 * column A and all stopping at the same column. Blocks on one sheet may be different widths — a
 * load-case table needs six columns and a reinforcement table nine — but nothing inside a block is
 * ever wider or narrower than the table it belongs to. A heading that runs two columns past its own
 * header is what makes a printed page look broken, and it was the reason these primitives were
 * pulled out of the two workbook builders that had each grown their own copy.
 *
 * Sheet-wide furniture — the title, the legend, a note about the whole sheet — spans the widest
 * block on that sheet instead, so the outer edge of the page is straight.
 *
 * The colour code is part of the contract, not decoration: it is how a reviewer tells an input they
 * may edit from a formula that will follow it and from an engine value that will not.
 */
import { GROUP_FILL, HEADER_FILL, NOTE_COLOR, TITLE_FILL } from './workbook-common'

type Cell = import('exceljs').Cell
type Worksheet = import('exceljs').Worksheet

export const INPUT_TEXT = 'FF0070C0'
export const FORMULA_TEXT = 'FF008000'
export const GENERATED_TEXT = 'FF64748B'
export const REGENERATE_TEXT = 'FFC65911'

const colorCellText = (cell: Cell, argb: string) => {
  cell.font = { ...(cell.font ?? {}), color: { argb } }
}

/** Editable: a value a reviewer may change, and the formulas below it will follow. */
export const styleInput = (cell: Cell) => colorCellText(cell, INPUT_TEXT)
/** Live spreadsheet algebra over the inputs. */
export const styleFormula = (cell: Cell) => colorCellText(cell, FORMULA_TEXT)
/** An engine value the workbook reproduces rather than re-derives. */
export const styleGenerated = (cell: Cell) => colorCellText(cell, GENERATED_TEXT)
/** Editing this changes the generated surface or mesh, so it needs a fresh export. */
export const styleRegenerate = (cell: Cell) => colorCellText(cell, REGENERATE_TEXT)

export const setFormula = (
  cell: Cell,
  formula: string,
  result: number | string | boolean,
  numFmt = '#,##0.000'
) => {
  cell.value = { formula: formula.startsWith('=') ? formula.slice(1) : formula, result }
  cell.numFmt = numFmt
  styleFormula(cell)
}

/** Sheet title on row 1, spanning the widest block on the sheet. */
export const reportTitle = (sheet: Worksheet, text: string, span: number) => {
  sheet.mergeCells(1, 1, 1, span)
  const cell = sheet.getCell(1, 1)
  cell.value = text
  cell.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TITLE_FILL } }
  cell.alignment = { vertical: 'middle' }
  sheet.getRow(1).height = 22
}

/** Block heading, merged across exactly the columns of the table beneath it. */
export const blockHeading = (sheet: Worksheet, row: number, text: string, span: number) => {
  sheet.mergeCells(row, 1, row, span)
  const cell = sheet.getCell(row, 1)
  cell.value = text
  cell.font = { bold: true, size: 11, color: { argb: 'FF1F3864' } }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GROUP_FILL } }
  cell.alignment = { vertical: 'middle' }
  sheet.getRow(row).height = 18
}

export const styleHeader = (
  sheet: Worksheet,
  row: number,
  labels: readonly string[],
  start = 1
) => {
  labels.forEach((label, index) => {
    const cell = sheet.getCell(row, start + index)
    cell.value = label
    cell.font = { bold: true, size: 10, color: { argb: 'FF1F2937' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF94A3B8' } } }
  })
  sheet.getRow(row).height = 28
}

/** Heading plus header row, both exactly `labels.length` wide. Returns the first body row. */
export const tableBlock = (
  sheet: Worksheet,
  row: number,
  title: string,
  labels: readonly string[]
) => {
  blockHeading(sheet, row, title, labels.length)
  styleHeader(sheet, row + 1, labels, 1)
  return row + 2
}

/** Italic explanatory row spanning `span` columns. */
export const sheetNote = (sheet: Worksheet, row: number, span: number, text: string) => {
  sheet.mergeCells(row, 1, row, span)
  const cell = sheet.getCell(row, 1)
  cell.value = text
  cell.font = { italic: true, size: 9, color: { argb: NOTE_COLOR } }
  cell.alignment = { wrapText: true, vertical: 'middle' }
  sheet.getRow(row).height = 24
}

/**
 * The colour legend as one merged row rather than five loose cells.
 *
 * As separate cells it inherited whatever widths the table below happened to need, so it ended in a
 * different column on every sheet. Merged to the sheet width with the colours carried by rich text,
 * it reads the same everywhere and its right edge lines up with the title.
 */
export const addLegend = (sheet: Worksheet, row: number, span: number) => {
  const entries = [
    ['Editable calculation input', INPUT_TEXT],
    ['Formula', FORMULA_TEXT],
    ['Generated / check', GENERATED_TEXT],
    ['Requires re-export / remesh', REGENERATE_TEXT]
  ] as const
  sheet.mergeCells(row, 1, row, span)
  const cell = sheet.getCell(row, 1)
  cell.value = {
    richText: [
      { font: { size: 9, bold: true, color: { argb: 'FF475569' } }, text: 'Legend    ' },
      ...entries.flatMap(([label, color], index) => [
        ...(index === 0
          ? []
          : [{ font: { size: 9, color: { argb: 'FFCBD5E1' } }, text: '    |    ' }]),
        { font: { size: 9, color: { argb: color } }, text: label }
      ])
    ]
  }
  cell.alignment = { vertical: 'middle' }
  sheet.getRow(row).height = 18
}

/** Alternating row tint over the visible columns of one table. */
export const zebraRows = (
  sheet: Worksheet,
  headerRow: number,
  rowCount: number,
  visibleColumns: number
) => {
  for (let row = headerRow + 1; row <= headerRow + rowCount; row++) {
    if ((row - headerRow) % 2 !== 0) continue
    for (let column = 1; column <= visibleColumns; column++) {
      sheet.getCell(row, column).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
    }
  }
}

/** Freeze under a table header, keeping the grid-line choice the caller already made. */
export const freezeUnder = (sheet: Worksheet, headerRow: number, xSplit = 0) => {
  sheet.views = [{
    state: 'frozen',
    xSplit,
    ySplit: headerRow,
    showGridLines: sheet.views[0]?.showGridLines ?? true
  }]
}

export const hideGridLines = (sheet: Worksheet) => {
  sheet.views = [{ ...sheet.views[0], showGridLines: false }]
  return sheet
}
