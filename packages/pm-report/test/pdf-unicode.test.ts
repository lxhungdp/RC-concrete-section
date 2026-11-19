import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { HELVETICA, splitTextRuns, UNICODE } from '../src/pdf/font-metrics'
import { UnicodeTrueTypeFont } from '../src/pdf/unicode-font'
import { PdfDocument } from '../src/pdf/writer'

const fontBytes = new Uint8Array(readFileSync(
  resolve(process.cwd(), 'apps/web/public/fonts/PMReportUnicode-Regular.ttf')
))

test('Unicode fallback maps Korean, Vietnamese, German and engineering symbols without dropping text', () => {
  const font = new UnicodeTrueTypeFont(fontBytes)
  const value = '기둥 C1 설계 · Cột trục A — tầng 3 · Säule · ε ≤ φ'
  const runs = splitTextRuns(value, HELVETICA, font)
  assert.ok(runs.some((run) => run.font === UNICODE))
  assert.equal(
    runs.reduce((count, run) => count + run.codes.length, 0),
    [...value].length
  )
})

test('unsupported PDF text fails visibly when no Unicode font is supplied', () => {
  assert.throws(
    () => splitTextRuns('기둥', HELVETICA),
    (error: unknown) => error instanceof RangeError && /U\+AE30/.test(error.message)
  )
})

test('PDF writer embeds a searchable Type0 font and remains byte deterministic', () => {
  const build = () => {
    const document = new PdfDocument({
      title: '기둥 C1 설계',
      author: 'P-M Column Designer',
      subject: 'Cột trục A — tầng 3'
    }, fontBytes)
    document.addPage().text(42, 780, '기둥 C1 설계 · Cột trục A — tầng 3 · Säule')
    return document.serialize()
  }
  const first = build()
  const second = build()
  assert.deepEqual(first, second)
  const raw = Buffer.from(first).toString('latin1')
  assert.match(raw, /\/Subtype \/Type0/)
  assert.match(raw, /\/ToUnicode/)
  assert.match(raw, /\/FontFile2/)
  assert.match(raw, /\/Title <FEFF/)
})
