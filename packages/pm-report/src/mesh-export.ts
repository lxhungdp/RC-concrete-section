import type {
  ConcreteMesh,
  GeometryInputRebarView,
  SectionGeometry
} from '@pm/geometry'
import type { Worksheet } from 'exceljs'

export type MeshAuditExportInput = {
  projectName: string
  sectionName: string
  section: SectionGeometry
  rebars: GeometryInputRebarView[]
  mesh: ConcreteMesh
}

const EXCEL_DATA_ROWS_PER_SHEET = 500_000
const EXCEL_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const safeStem = (value: string) =>
  (value || 'pm-section')
    .trim()
    .replace(/[^\w]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'pm-section'

export const meshAuditFileName = (
  input: Pick<MeshAuditExportInput, 'projectName'>,
  extension: 'xlsx' | 'dxf'
) => `${safeStem(input.projectName)}-section-mesh.${extension}`

const headerStyle = {
  fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF0F766E' } },
  font: { bold: true, color: { argb: 'FFFFFFFF' } },
  alignment: { vertical: 'middle' as const }
}

const titleStyle = {
  fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF0F172A' } },
  font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 15 }
}

const applyTableHeader = (sheet: Worksheet, columns: number) => {
  const row = sheet.getRow(1)
  row.height = 22
  row.eachCell((cell) => {
    cell.style = headerStyle
  })
  sheet.autoFilter = `A1:${excelColumn(columns)}1`
}

const excelColumn = (number: number) => {
  let current = number
  let result = ''
  while (current > 0) {
    current--
    result = String.fromCharCode(65 + (current % 26)) + result
    current = Math.floor(current / 26)
  }
  return result
}

const chunkRanges = (count: number) => {
  const chunks: Array<{ start: number; end: number; index: number }> = []
  for (let start = 0, index = 1; start < count; start += EXCEL_DATA_ROWS_PER_SHEET, index++) {
    chunks.push({
      start,
      end: Math.min(count, start + EXCEL_DATA_ROWS_PER_SHEET),
      index
    })
  }
  return chunks.length > 0 ? chunks : [{ start: 0, end: 0, index: 1 }]
}

export const buildMeshAuditWorkbook = async (input: MeshAuditExportInput) => {
  const imported = await import('exceljs')
  const ExcelJS = ((imported as unknown as { default?: typeof imported }).default ?? imported) as typeof imported
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'P-M Column Designer'
  workbook.created = new Date()
  workbook.calcProperties.fullCalcOnLoad = true

  const { mesh, section, rebars } = input
  const summary = workbook.addWorksheet('Summary', {
    views: [{ state: 'frozen', ySplit: 4 }]
  })
  const triangleChunks = chunkRanges(mesh.triangles.length)
  const pointChunks = chunkRanges(mesh.points.length)
  const triangleSheets: Array<{ name: string; rows: number }> = []
  const pointSheets: Array<{ name: string; rows: number }> = []

  for (const chunk of triangleChunks) {
    const name = triangleChunks.length === 1 ? 'Triangles' : `Triangles_${chunk.index}`
    const sheet = workbook.addWorksheet(name, {
      views: [{ state: 'frozen', ySplit: 1 }]
    })
    sheet.columns = [
      { header: 'Triangle ID', key: 'id', width: 13 },
      { header: 'Cell i', key: 'cellI', width: 10 },
      { header: 'Cell j', key: 'cellJ', width: 10 },
      { header: 'Depth', key: 'depth', width: 9 },
      { header: 'Component', key: 'component', width: 12 },
      { header: 'Local triangle', key: 'localTriangle', width: 14 },
      { header: 'Ax (mm)', key: 'ax', width: 14 },
      { header: 'Ay (mm)', key: 'ay', width: 14 },
      { header: 'Bx (mm)', key: 'bx', width: 14 },
      { header: 'By (mm)', key: 'by', width: 14 },
      { header: 'Cx (mm)', key: 'cx', width: 14 },
      { header: 'Cy (mm)', key: 'cy', width: 14 },
      { header: 'Area (mm²)', key: 'area', width: 15 },
      { header: 'Centroid x (mm)', key: 'centroidX', width: 17 },
      { header: 'Centroid y (mm)', key: 'centroidY', width: 17 }
    ]
    applyTableHeader(sheet, 15)

    for (let index = chunk.start; index < chunk.end; index++) {
      const triangle = mesh.triangles[index]
      const row = sheet.addRow([
        index + 1,
        triangle.cellI,
        triangle.cellJ,
        triangle.depth,
        triangle.component,
        triangle.triangle,
        triangle.ax,
        triangle.ay,
        triangle.bx,
        triangle.by,
        triangle.cx,
        triangle.cy,
        triangle.area
      ])
      row.getCell(14).value = { formula: `=(G${row.number}+I${row.number}+K${row.number})/3` }
      row.getCell(15).value = { formula: `=(H${row.number}+J${row.number}+L${row.number})/3` }
    }
    sheet.getColumn(1).numFmt = '#,##0'
    for (let column = 2; column <= 6; column++) sheet.getColumn(column).numFmt = '0'
    for (let column = 7; column <= 15; column++) sheet.getColumn(column).numFmt = '0.000000'
    triangleSheets.push({ name, rows: chunk.end - chunk.start })
  }

  for (const chunk of pointChunks) {
    const name = pointChunks.length === 1 ? 'Quadrature' : `Quadrature_${chunk.index}`
    const sheet = workbook.addWorksheet(name, {
      views: [{ state: 'frozen', ySplit: 1 }]
    })
    sheet.columns = [
      { header: 'Point ID', key: 'id', width: 13 },
      { header: 'Cell i', key: 'cellI', width: 10 },
      { header: 'Cell j', key: 'cellJ', width: 10 },
      { header: 'Depth', key: 'depth', width: 9 },
      { header: 'Component', key: 'component', width: 12 },
      { header: 'Local triangle', key: 'localTriangle', width: 14 },
      { header: 'Rule point', key: 'point', width: 11 },
      { header: 'x (mm)', key: 'x', width: 14 },
      { header: 'y (mm)', key: 'y', width: 14 },
      { header: 'Weight (mm²)', key: 'area', width: 16 },
      { header: 'Qx contribution (mm³)', key: 'qx', width: 22 },
      { header: 'Qy contribution (mm³)', key: 'qy', width: 22 }
    ]
    applyTableHeader(sheet, 12)

    for (let index = chunk.start; index < chunk.end; index++) {
      const point = mesh.points[index]
      const row = sheet.addRow([
        index + 1,
        point.cellI,
        point.cellJ,
        point.depth,
        point.component,
        point.triangle,
        point.point + 1,
        point.x,
        point.y,
        point.area
      ])
      row.getCell(11).value = { formula: `=I${row.number}*J${row.number}` }
      row.getCell(12).value = { formula: `=H${row.number}*J${row.number}` }
    }
    sheet.getColumn(1).numFmt = '#,##0'
    for (let column = 2; column <= 7; column++) sheet.getColumn(column).numFmt = '0'
    for (let column = 8; column <= 12; column++) sheet.getColumn(column).numFmt = '0.000000'
    pointSheets.push({ name, rows: chunk.end - chunk.start })
  }

  const boundarySheet = workbook.addWorksheet('Boundaries', {
    views: [{ state: 'frozen', ySplit: 1 }]
  })
  boundarySheet.columns = [
    { header: 'Kind', key: 'kind', width: 12 },
    { header: 'Solid', key: 'solid', width: 10 },
    { header: 'Ring', key: 'ring', width: 10 },
    { header: 'Vertex', key: 'vertex', width: 10 },
    { header: 'Point ID', key: 'id', width: 12 },
    { header: 'x (mm)', key: 'x', width: 16 },
    { header: 'y (mm)', key: 'y', width: 16 }
  ]
  applyTableHeader(boundarySheet, 7)
  section.solids.forEach((solid, solidIndex) => {
    ;[solid.outer, ...solid.holes].forEach((ring, ringIndex) => {
      ring.forEach((point, pointIndex) => {
        boundarySheet.addRow([
          ringIndex === 0 ? 'Outer' : 'Hole',
          solidIndex + 1,
          ringIndex + 1,
          pointIndex + 1,
          point.id,
          point.x,
          point.y
        ])
      })
    })
  })
  boundarySheet.getColumn(5).numFmt = '0'
  boundarySheet.getColumn(6).numFmt = '0.000000'
  boundarySheet.getColumn(7).numFmt = '0.000000'

  const rebarSheet = workbook.addWorksheet('Rebars', {
    views: [{ state: 'frozen', ySplit: 1 }]
  })
  rebarSheet.columns = [
    { header: 'Rebar ID', key: 'id', width: 12 },
    { header: 'Diameter (mm)', key: 'diameter', width: 16 },
    { header: 'x (mm)', key: 'x', width: 16 },
    { header: 'y (mm)', key: 'y', width: 16 },
    { header: 'Steel material ID', key: 'material', width: 18 }
  ]
  applyTableHeader(rebarSheet, 5)
  rebars.forEach((bar) =>
    rebarSheet.addRow([bar.id, bar.dia, bar.x, bar.y, bar.steelMaterialId ?? 'Default'])
  )
  for (let column = 1; column <= 4; column++) rebarSheet.getColumn(column).numFmt = '0.000000'

  const sumRanges = (
    sheets: Array<{ name: string; rows: number }>,
    column: string
  ) =>
    sheets
      .filter((sheet) => sheet.rows > 0)
      .map((sheet) => `'${sheet.name}'!${column}2:${column}${sheet.rows + 1}`)
      .join(',')

  summary.mergeCells('A1:F1')
  summary.getCell('A1').value = 'SECTION MESH AUDIT EXPORT'
  summary.getCell('A1').style = titleStyle
  summary.getRow(1).height = 28
  summary.getCell('A2').value = 'Project'
  summary.getCell('B2').value = input.projectName
  summary.getCell('D2').value = 'Section'
  summary.getCell('E2').value = input.sectionName
  summary.getCell('A3').value = 'Generated'
  summary.getCell('B3').value = new Date().toISOString()
  summary.getCell('D3').value = 'Units'
  summary.getCell('E3').value = 'mm, mm², mm³'

  summary.addRow([])
  summary.addRow(['Mesh configuration', 'Value', 'Unit', 'Verification metric', 'Value', 'Status'])
  summary.getRow(5).eachCell((cell) => {
    cell.style = headerStyle
  })
  const report = mesh.report
  const configurationRows: Array<[
    string,
    number | string,
    string | null,
    string,
    number | string,
    string
  ]> = [
    ['Cell size', report.cellSize, 'mm', 'Exact area', report.exact.area, 'Reference'],
    ['Minimum caliper width', report.minCaliperWidth, 'mm', 'Meshed area (report)', report.meshed.area, 'Engine'],
    ['Grid X', report.gridX, 'cells', 'Area error', report.areaError, report.ok ? 'OK' : 'CHECK'],
    ['Grid Y', report.gridY, 'cells', 'Exact Qx', report.exact.firstMomentX, 'Reference'],
    ['Occupied cells', report.cells, 'cells', 'Meshed Qx (report)', report.meshed.firstMomentX, 'Engine'],
    ['Components', report.components, null, 'Qx error', report.firstMomentXError, report.ok ? 'OK' : 'CHECK'],
    ['Triangles', report.triangles, null, 'Exact Qy', report.exact.firstMomentY, 'Reference'],
    ['Quadrature points', report.points, null, 'Meshed Qy (report)', report.meshed.firstMomentY, 'Engine'],
    ['Discarded area', report.discardedArea, 'mm²', 'Qy error', report.firstMomentYError, report.ok ? 'OK' : 'CHECK']
  ]
  configurationRows.forEach((row) => summary.addRow(row))

  summary.addRow([])
  const auditHeaderRow = summary.rowCount + 1
  summary.addRow(['Workbook recomputation', 'Formula result', 'Engine result', 'Difference', 'Tolerance', 'Status'])
  summary.getRow(auditHeaderRow).eachCell((cell) => {
    cell.style = headerStyle
  })
  const areaRanges = sumRanges(pointSheets, 'J')
  const qxRanges = sumRanges(pointSheets, 'K')
  const qyRanges = sumRanges(pointSheets, 'L')
  const auditMetrics = [
    ['Σ quadrature weight', areaRanges ? `=SUM(${areaRanges})` : '=0', report.meshed.area],
    ['Σ y·weight', qxRanges ? `=SUM(${qxRanges})` : '=0', report.meshed.firstMomentX],
    ['Σ x·weight', qyRanges ? `=SUM(${qyRanges})` : '=0', report.meshed.firstMomentY]
  ] as const
  auditMetrics.forEach(([label, formula, engine]) => {
    const row = summary.addRow([label])
    row.getCell(2).value = { formula }
    row.getCell(3).value = engine
    row.getCell(4).value = { formula: `=B${row.number}-C${row.number}` }
    row.getCell(5).value = Math.max(1e-9, Math.abs(engine) * 1e-10)
    row.getCell(6).value = {
      formula: `=IF(ABS(D${row.number})<=E${row.number},"OK","CHECK")`
    }
  })

  summary.addRow([])
  summary.addRow(['Warnings'])
  summary.getRow(summary.rowCount).getCell(1).style = headerStyle
  if (report.warnings.length === 0) summary.addRow(['None'])
  else report.warnings.forEach((warning) => summary.addRow([warning]))
  summary.columns = [
    { width: 29 },
    { width: 22 },
    { width: 15 },
    { width: 29 },
    { width: 22 },
    { width: 14 }
  ]
  for (let row = 6; row <= 14; row++) {
    summary.getCell(row, 2).numFmt = '0.000000'
    summary.getCell(row, 5).numFmt = '0.000000'
  }
  for (let row = auditHeaderRow + 1; row <= auditHeaderRow + auditMetrics.length; row++) {
    for (let column = 2; column <= 5; column++) {
      summary.getCell(row, column).numFmt = '0.000000'
    }
  }
  summary.getColumn(6).alignment = { horizontal: 'center' }
  summary.eachRow((row) => {
    row.alignment = { vertical: 'middle' }
  })
  return workbook
}

export const exportMeshAuditWorkbook = async (input: MeshAuditExportInput) => {
  const workbook = await buildMeshAuditWorkbook(input)
  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], { type: EXCEL_MIME })
}

const dxfPair = (code: number, value: string | number) => [String(code), String(value)]

const appendLine = (
  lines: string[],
  layer: string,
  start: { x: number; y: number },
  end: { x: number; y: number }
) => {
  lines.push(
    ...dxfPair(0, 'LINE'),
    ...dxfPair(8, layer),
    ...dxfPair(10, start.x),
    ...dxfPair(20, start.y),
    ...dxfPair(30, 0),
    ...dxfPair(11, end.x),
    ...dxfPair(21, end.y),
    ...dxfPair(31, 0)
  )
}

const appendClosedLineLoop = (
  lines: string[],
  layer: string,
  points: Array<{ x: number; y: number }>
) => {
  for (let index = 0; index < points.length; index++) {
    appendLine(lines, layer, points[index], points[(index + 1) % points.length])
  }
}

export const buildMeshAuditDxf = (input: MeshAuditExportInput) => {
  const { mesh, section, rebars } = input
  const lines: string[] = [
    ...dxfPair(0, 'SECTION'),
    ...dxfPair(2, 'HEADER'),
    ...dxfPair(9, '$ACADVER'),
    ...dxfPair(1, 'AC1009'),
    ...dxfPair(0, 'ENDSEC'),
    ...dxfPair(0, 'SECTION'),
    ...dxfPair(2, 'TABLES'),
    ...dxfPair(0, 'TABLE'),
    ...dxfPair(2, 'LTYPE'),
    ...dxfPair(70, 1),
    ...dxfPair(0, 'LTYPE'),
    ...dxfPair(2, 'CONTINUOUS'),
    ...dxfPair(70, 0),
    ...dxfPair(3, 'Solid line'),
    ...dxfPair(72, 65),
    ...dxfPair(73, 0),
    ...dxfPair(40, 0),
    ...dxfPair(0, 'ENDTAB'),
    ...dxfPair(0, 'TABLE'),
    ...dxfPair(2, 'LAYER'),
    ...dxfPair(70, 6),
    ...dxfPair(0, 'LAYER'),
    ...dxfPair(2, '0'),
    ...dxfPair(70, 0),
    ...dxfPair(62, 7),
    ...dxfPair(6, 'CONTINUOUS')
  ]
  const layers = [
    ['MESH_TRIANGLES', 8],
    ['QUADRATURE_POINTS', 5],
    ['SECTION_OUTER', 7],
    ['SECTION_HOLES', 4],
    ['REBAR', 1]
  ] as const
  for (const [name, color] of layers) {
    lines.push(
      ...dxfPair(0, 'LAYER'),
      ...dxfPair(2, name),
      ...dxfPair(70, 0),
      ...dxfPair(62, color),
      ...dxfPair(6, 'CONTINUOUS')
    )
  }
  lines.push(
    ...dxfPair(0, 'ENDTAB'),
    ...dxfPair(0, 'ENDSEC'),
    ...dxfPair(0, 'SECTION'),
    ...dxfPair(2, 'BLOCKS'),
    ...dxfPair(0, 'ENDSEC'),
    ...dxfPair(0, 'SECTION'),
    ...dxfPair(2, 'ENTITIES')
  )

  for (const triangle of mesh.triangles) {
    lines.push(
      ...dxfPair(0, '3DFACE'),
      ...dxfPair(8, 'MESH_TRIANGLES'),
      ...dxfPair(10, triangle.ax),
      ...dxfPair(20, triangle.ay),
      ...dxfPair(30, 0),
      ...dxfPair(11, triangle.bx),
      ...dxfPair(21, triangle.by),
      ...dxfPair(31, 0),
      ...dxfPair(12, triangle.cx),
      ...dxfPair(22, triangle.cy),
      ...dxfPair(32, 0),
      ...dxfPair(13, triangle.cx),
      ...dxfPair(23, triangle.cy),
      ...dxfPair(33, 0),
      ...dxfPair(70, 0)
    )
  }

  for (const point of mesh.points) {
    lines.push(
      ...dxfPair(0, 'POINT'),
      ...dxfPair(8, 'QUADRATURE_POINTS'),
      ...dxfPair(10, point.x),
      ...dxfPair(20, point.y),
      ...dxfPair(30, 0)
    )
  }

  for (const solid of section.solids) {
    appendClosedLineLoop(lines, 'SECTION_OUTER', solid.outer)
    for (const hole of solid.holes) appendClosedLineLoop(lines, 'SECTION_HOLES', hole)
  }
  for (const bar of rebars) {
    lines.push(
      ...dxfPair(0, 'CIRCLE'),
      ...dxfPair(8, 'REBAR'),
      ...dxfPair(10, bar.x),
      ...dxfPair(20, bar.y),
      ...dxfPair(30, 0),
      ...dxfPair(40, bar.dia / 2)
    )
  }

  lines.push(...dxfPair(0, 'ENDSEC'), ...dxfPair(0, 'EOF'))
  return `${lines.join('\r\n')}\r\n`
}

export const exportMeshAuditDxf = (input: MeshAuditExportInput) =>
  new Blob([buildMeshAuditDxf(input)], { type: 'application/dxf' })
