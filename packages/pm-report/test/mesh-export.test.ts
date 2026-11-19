import { strict as assert } from 'node:assert'
import test from 'node:test'
import {
  buildConcreteMesh,
  geometryInputRebars,
  sectionGeometryFromGeometryInput
} from '@pm/geometry'
import { referenceProjectDocument } from '../../pm-analysis/test/fixtures/reference-case'
import {
  buildMeshAuditDxf,
  buildMeshAuditWorkbook,
  meshAuditFileName
} from '../src/audit/mesh-export'

const document = referenceProjectDocument()
const section = sectionGeometryFromGeometryInput(document.inputs.geometry)
const rebars = geometryInputRebars(document.inputs.geometry)
const mesh = buildConcreteMesh(section, { seedDivisions: 8 })
const input = {
  projectName: 'Mesh audit test',
  sectionName: section.name,
  section,
  rebars,
  mesh
}

test('mesh audit workbook contains every triangle and quadrature point with traceable formulas', async () => {
  const workbook = await buildMeshAuditWorkbook(input)
  const summary = workbook.getWorksheet('Summary')
  const triangles = workbook.getWorksheet('Triangles')
  const quadrature = workbook.getWorksheet('Quadrature')
  assert.ok(summary)
  assert.ok(triangles)
  assert.ok(quadrature)
  assert.equal(triangles.rowCount, mesh.triangles.length + 1)
  assert.equal(quadrature.rowCount, mesh.points.length + 1)
  assert.equal(triangles.getCell('N2').formula, '=(G2+I2+K2)/3')
  assert.equal(quadrature.getCell('K2').formula, '=I2*J2')
  assert.equal(workbook.getWorksheet('Boundaries')?.rowCount, 1 + section.solids.flatMap((solid) => [solid.outer, ...solid.holes]).flat().length)
  assert.equal(workbook.getWorksheet('Rebars')?.rowCount, rebars.length + 1)

  const buffer = await workbook.xlsx.writeBuffer()
  const bytes = new Uint8Array(buffer)
  assert.deepEqual([...bytes.slice(0, 2)], [0x50, 0x4b])
})

test('mesh audit DXF exports all verification layers and entity families', () => {
  const dxf = buildMeshAuditDxf(input)
  const lines = dxf.split('\r\n')
  assert.equal(lines.at(-1), '')
  assert.equal((lines.length - 1) % 2, 0)
  const groupCodes: number[] = []
  for (let index = 0; index < lines.length - 1; index += 2) {
    assert.match(lines[index], /^-?\d+$/, `invalid DXF group code at line ${index + 1}`)
    groupCodes.push(Number(lines[index]))
  }
  assert.match(dxf, /\r\n1\r\nAC1009\r\n/)
  assert.match(dxf, /\r\n2\r\nBLOCKS\r\n/)
  assert.match(dxf, /\r\n2\r\nENTITIES\r\n/)
  assert.match(dxf, /\r\n2\r\nMESH_TRIANGLES\r\n/)
  assert.match(dxf, /\r\n2\r\nQUADRATURE_POINTS\r\n/)
  assert.match(dxf, /\r\n2\r\nSECTION_OUTER\r\n/)
  assert.match(dxf, /\r\n2\r\nSECTION_HOLES\r\n/)
  assert.match(dxf, /\r\n2\r\nREBAR\r\n/)
  assert.equal((dxf.match(/\r\n0\r\n3DFACE\r\n/g) ?? []).length, mesh.triangles.length)
  assert.equal((dxf.match(/\r\n0\r\nPOINT\r\n/g) ?? []).length, mesh.points.length)
  assert.equal((dxf.match(/\r\n0\r\nCIRCLE\r\n/g) ?? []).length, rebars.length)
  assert.equal(groupCodes.includes(100), false)
  assert.doesNotMatch(dxf, /LWPOLYLINE/)
  assert.ok(dxf.endsWith('0\r\nEOF\r\n'))
  assert.equal(meshAuditFileName(input, 'xlsx'), 'Mesh-audit-test-section-mesh.xlsx')
  assert.equal(meshAuditFileName(input, 'dxf'), 'Mesh-audit-test-section-mesh.dxf')
})
