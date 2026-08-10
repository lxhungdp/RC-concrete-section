import fs from 'node:fs/promises'
import { resolve } from 'node:path'
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool'

const root = process.cwd()
const qaDir = resolve(root, 'outputs/019fe8f4-4218-7a11-b43b-08f182dd459d/qa-fixedp')
const finalPath = resolve(root, 'outputs/019fe8f4-4218-7a11-b43b-08f182dd459d/fixed-p-chart-audit-sample.xlsx')
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(finalPath))

const summary = await workbook.inspect({
  kind: 'workbook,sheet,table',
  maxChars: 6000,
  tableMaxRows: 6,
  tableMaxCols: 8,
  tableMaxCellChars: 100
})
await fs.writeFile(resolve(qaDir, 'inspect-summary.ndjson'), summary.ndjson)

const result = await workbook.inspect({
  kind: 'table',
  range: 'Result!A1:R20',
  include: 'values,formulas',
  tableMaxRows: 20,
  tableMaxCols: 18,
  maxChars: 8000
})
await fs.writeFile(resolve(qaDir, 'inspect-result.ndjson'), result.ndjson)

const lower = await workbook.inspect({
  kind: 'table',
  range: 'FixedP_Lower!A1:AL16',
  include: 'values,formulas',
  tableMaxRows: 16,
  tableMaxCols: 38,
  maxChars: 10000
})
await fs.writeFile(resolve(qaDir, 'inspect-lower-cap.ndjson'), lower.ndjson)

const errors = await workbook.inspect({
  kind: 'match',
  searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A',
  options: { useRegex: true, maxResults: 300 },
  summary: 'final formula error scan'
})
await fs.writeFile(resolve(qaDir, 'formula-error-scan.ndjson'), errors.ndjson)

const renderNames = {
  Geometry: 'geometry.png',
  Materials: 'materials.png',
  Mesh: 'mesh.png',
  FixedP_Lower: 'fixedp_lower.png',
  FixedP_Upper: 'fixedp_upper.png',
  Result: 'result.png'
}
for (const [sheetName, fileName] of Object.entries(renderNames)) {
  const preview = await workbook.render({ sheetName, autoCrop: 'all', scale: 1, format: 'png' })
  await fs.writeFile(resolve(qaDir, fileName), new Uint8Array(await preview.arrayBuffer()))
}
