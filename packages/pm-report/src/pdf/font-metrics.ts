/**
 * Advance widths for the PDF standard-14 fonts this report uses.
 *
 * Nothing is embedded: Helvetica, Helvetica-Bold and Symbol are guaranteed present in every
 * conforming reader, so the file carries no font programme, no licence question, and no subsetting
 * step whose output could vary between runs. The cost is that we must carry the metrics ourselves,
 * because text measurement — centring a label, wrapping a note, sizing a table column — happens
 * here rather than in a layout engine.
 *
 * Widths are in 1/1000 em, exactly as the AFM files publish them.
 */
export type PdfFontId = 'F1' | 'F2' | 'F3'

export const HELVETICA: PdfFontId = 'F1'
export const HELVETICA_BOLD: PdfFontId = 'F2'
export const SYMBOL: PdfFontId = 'F3'

const ascii = (widths: readonly number[]) => {
  const table = new Map<number, number>()
  widths.forEach((width, index) => table.set(32 + index, width))
  return table
}

/** ASCII 32-126, then the WinAnsi codes an engineering report actually reaches for. */
const HELVETICA_WIDTHS = ascii([
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584
])

const HELVETICA_BOLD_WIDTHS = ascii([
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584
])

const WIN_ANSI_EXTRA: ReadonlyArray<readonly [number, number, number]> = [
  // [code, helvetica, helvetica-bold]
  [150, 556, 556], // en dash
  [151, 1000, 1000], // em dash
  [176, 400, 400], // degree
  [177, 584, 584], // plus-minus
  [178, 333, 333], // superscript two
  [179, 333, 333], // superscript three
  [183, 278, 278], // middle dot
  [215, 584, 584], // multiply
  [247, 584, 584] // divide
]
for (const [code, regular, bold] of WIN_ANSI_EXTRA) {
  HELVETICA_WIDTHS.set(code, regular)
  HELVETICA_BOLD_WIDTHS.set(code, bold)
}

/** Only the Symbol glyphs the report maps to; the rest would never be requested. */
const SYMBOL_WIDTHS = new Map<number, number>([
  [65, 722], [66, 667], [68, 612], [70, 763], [71, 603], [76, 631], [80, 549], [81, 549],
  [83, 592], [87, 686], [88, 620], [89, 795],
  [97, 631], [98, 549], [99, 549], [100, 494], [101, 439], [102, 521], [103, 411], [104, 603],
  [105, 329], [106, 603], [107, 549], [108, 549], [109, 576], [110, 521], [111, 549], [112, 549],
  [113, 521], [114, 549], [115, 603], [116, 439], [117, 576], [118, 713], [119, 686], [120, 493],
  [121, 686], [122, 494],
  [163, 549], [179, 549], [187, 549], [185, 549], [64, 549]
])

const WIDTHS: Record<PdfFontId, Map<number, number>> = {
  F1: HELVETICA_WIDTHS,
  F2: HELVETICA_BOLD_WIDTHS,
  F3: SYMBOL_WIDTHS
}

/**
 * Greek letters and relational symbols that WinAnsi simply does not encode.
 *
 * Engineering notation is not decoration here — a report that writes "beta1" where the code writes
 * `β1` is harder to reconcile against the standard it cites. Mapping them onto the Symbol font
 * keeps the notation without embedding anything.
 */
const SYMBOL_CODES = new Map<string, number>([
  ['α', 97], ['β', 98], ['χ', 99], ['δ', 100], ['ε', 101], ['φ', 102], ['γ', 103], ['η', 104],
  ['ι', 105], ['κ', 107], ['λ', 108], ['μ', 109], ['ν', 110], ['ο', 111], ['π', 112], ['θ', 113],
  ['ρ', 114], ['σ', 115], ['τ', 116], ['υ', 117], ['ω', 119], ['ξ', 120], ['ψ', 121], ['ζ', 122],
  ['Α', 65], ['Β', 66], ['Δ', 68], ['Φ', 70], ['Γ', 71], ['Λ', 76], ['Π', 80], ['Θ', 81],
  ['Σ', 83], ['Ω', 87], ['Ξ', 88], ['Ψ', 89],
  ['≤', 163], ['≥', 179], ['≈', 187], ['≠', 185], ['∈', 64]
])

/** WinAnsi differs from Unicode above 0x7F for a handful of codes the report uses. */
const WIN_ANSI_CODES = new Map<string, number>([
  ['–', 150], ['—', 151], ['°', 176], ['±', 177], ['²', 178], ['³', 179], ['·', 183],
  ['×', 215], ['÷', 247], ['’', 39], ['‘', 39], ['“', 34], ['”', 34], ['…', 46],
  // U+2212 MINUS SIGN reads as a hyphen in WinAnsi. Dropping it instead would turn "My = −ΣF·x"
  // into "My = ΣF·x", which is the opposite statement.
  ['−', 45], ['‑', 45], ['‒', 150]
])

export type TextRun = {
  font: PdfFontId
  /** Byte codes in the run's own encoding, ready to be escaped into a PDF string. */
  codes: number[]
}

/**
 * Split a string into runs by font.
 *
 * A character with no representation in either encoding is dropped rather than substituted: a
 * silent `?` in a dimension or a factor would be worse than a visible gap, and every character the
 * report actually emits is covered by the maps above.
 */
export const splitTextRuns = (text: string, latin: PdfFontId): TextRun[] => {
  const runs: TextRun[] = []
  let current: TextRun | null = null
  const push = (font: PdfFontId, code: number) => {
    if (!current || current.font !== font) {
      current = { font, codes: [] }
      runs.push(current)
    }
    current.codes.push(code)
  }
  for (const character of text) {
    const symbol = SYMBOL_CODES.get(character)
    if (symbol !== undefined) {
      push(SYMBOL, symbol)
      continue
    }
    const winAnsi = WIN_ANSI_CODES.get(character)
    if (winAnsi !== undefined) {
      push(latin, winAnsi)
      continue
    }
    const code = character.codePointAt(0) ?? 0
    if (code >= 32 && code <= 126) {
      push(latin, code)
      continue
    }
    if (WIDTHS[latin].has(code) && code <= 255) push(latin, code)
  }
  return runs
}

export const runWidth = (run: TextRun, size: number) => {
  const table = WIDTHS[run.font]
  let total = 0
  for (const code of run.codes) total += table.get(code) ?? 500
  return (total * size) / 1000
}

export const measureText = (text: string, latin: PdfFontId, size: number) =>
  splitTextRuns(text, latin).reduce((sum, run) => sum + runWidth(run, size), 0)

/** Longest prefix of `text` that fits `width`, split on spaces where possible. */
export const wrapText = (text: string, latin: PdfFontId, size: number, width: number): string[] => {
  const words = text.split(/\s+/).filter((word) => word.length > 0)
  if (words.length === 0) return ['']
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const candidate = line.length === 0 ? word : `${line} ${word}`
    if (measureText(candidate, latin, size) <= width || line.length === 0) {
      line = candidate
      continue
    }
    lines.push(line)
    line = word
  }
  if (line.length > 0) lines.push(line)
  return lines
}
