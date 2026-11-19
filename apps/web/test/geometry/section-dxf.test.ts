import assert from 'node:assert/strict'
import test from 'node:test'
import { createSectionSolid, geometryInputFromOuterRings, summarizeSection, validateGeometryInput } from '@pm/geometry'
import { createDefaultMaterialStore, createKdsRebarSteel } from '@pm/materials'
import { CALCULATION_PROFILE_IDS } from '@pm/project'
import { buildSectionDxf, DRAWING_LIMITS, importSectionDxf, sectionDrawingFileName, type DrawingResult, type SectionDrawing } from '../../features/section-editor/geometry/section-dxf'
import { prepareDrawingImport } from '../../features/section-editor/geometry/section-drawing-import'

// Hand-authored Autodesk group-code fixture helpers; independent of the export writer.
const fixture = (entities: string, units: number | null = 4, extraHeader = '') =>
  `0\nSECTION\n2\nHEADER\n${units === null ? '' : `9\n$INSUNITS\n70\n${units}\n`}${extraHeader}0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${entities}0\nENDSEC\n0\nEOF\n`
const polygon = (xy: number[][], layer = 'pm', flags = 1, extra = '') =>
  `0\nLWPOLYLINE\n8\n${layer}\n90\n${xy.length}\n70\n${flags}\n${extra}${xy.map(([x, y]) => `10\n${x}\n20\n${y}\n`).join('')}`
const rect = (x: number, y: number, w: number, h: number) => [[x,y],[x+w,y],[x+w,y+h],[x,y+h]]
const circle = (x: number, y: number, radius: number, extra = '') => `0\nCIRCLE\n8\npm\n10\n${x}\n20\n${y}\n40\n${radius}\n${extra}`
const value = <T>(result: DrawingResult<T>) => {
  if (!result.ok) assert.fail(`${result.issue.code}: ${result.issue.message}`)
  return result.value
}
const failure = (text: string, code: string) => {
  const result = importSectionDxf(text)
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.issue.code, code)
}
const coordinates = (drawing: SectionDrawing) => ({
  outers: drawing.outers.map(outer => outer.map(ring => ring.map(({x,y})=>[x,y]))),
  rebars: drawing.rebars.map(({x,y,dia})=>({x,y,dia}))
})
const hollow = polygon(rect(-200,-300,400,600)) + polygon(rect(-50,-50,100,100))

test('REBAR-AS-003: DXF rejects independent areas instead of silently losing an engineering input', () => {
  const drawing = value(importSectionDxf(fixture(polygon(rect(0,0,400,600)) + circle(100,100,10))))
  drawing.rebars[0].area = 300
  const lostArea = buildSectionDxf(drawing)
  assert.equal(lostArea.ok, false)
  if (!lostArea.ok) assert.equal(lostArea.issue.code, 'UNSUPPORTED_REBAR_AREA')
  drawing.rebars[0].area = (Math.PI * 20 * 20) / 4
  assert.equal(buildSectionDxf(drawing).ok, true)
  drawing.rebars[0].area = 0
  const invalid = buildSectionDxf(drawing)
  assert.equal(invalid.ok, false)
  if (!invalid.ok) assert.equal(invalid.issue.code, 'INVALID_GEOMETRY')
})

test('DXF-001/002: single pm layer infers holes before outers; analytic area/centroid and actual circle diameter', () => {
  const drawing = value(importSectionDxf(fixture(polygon(rect(-50,-50,100,100),'PM') + polygon(rect(-200,-300,400,600)) + circle(-140,-240,12.5))))
  assert.equal(drawing.outers.length,1)
  assert.equal(drawing.outers[0].length,2)
  const summary = summarizeSection({id:1,name:'Independent rectangle oracle',solids:drawing.outers.map(rings=>createSectionSolid(rings[0],rings.slice(1)))})
  assert.equal(summary.area,230000)
  assert.equal(summary.centroid.x,0)
  assert.equal(summary.centroid.y,0)
  assert.deepEqual(drawing.rebars.map(({x,y,dia})=>({x,y,dia})),[{x:-140,y:-240,dia:25}])
})

test('DXF-001: winding/order-independent nesting includes a concrete island and a disconnected outer', () => {
  const rings = [rect(100,100,100,100),rect(0,0,800,800),rect(50,50,300,300),rect(1000,0,300,400)]
  const drawing = value(importSectionDxf(fixture(rings.map((ring,i)=>polygon(i%2 ? ring.slice().reverse() : ring)).join(''))))
  assert.equal(drawing.outers.length,3)
  assert.deepEqual(drawing.outers.map(rings=>rings.length).sort(),[1,1,2])
})

test('DXF-002: circles above and below 50 mm are always bars; tiny closed polygons are holes', () => {
  const drawing = value(importSectionDxf(fixture(polygon(rect(0,0,1000,600)) + polygon(rect(450,250,20,20)) + circle(100,100,50) + circle(800,400,10))))
  assert.deepEqual(drawing.rebars.map(bar=>bar.dia),[100,20])
  assert.equal(drawing.outers[0].length,2)
})

test('DXF-002: translated asymmetric geometry exports/reimports full precision, circle radius and only pm entities', () => {
  const original = value(importSectionDxf(fixture(polygon(rect(-200.1234567890123,-300.25,400,600)) + circle(-140.1234567890123,-240.25,12.5))))
  const text = value(buildSectionDxf(original))
  assert.ok(text.includes('AC1015\r\n'))
  assert.ok(text.includes('$INSUNITS\r\n70\r\n4\r\n'))
  assert.ok(text.includes('40\r\n12.5\r\n'))
  const entityText = text.split('2\r\nENTITIES\r\n')[1].split('0\r\nENDSEC')[0]
  assert.equal((entityText.match(/8\r\npm\r\n/g) ?? []).length,2)
  assert.deepEqual(coordinates(value(importSectionDxf(text))),coordinates(original))
  assert.equal(value(buildSectionDxf(original)),text)
  assert.equal(sectionDrawingFileName('A / B'),'A---B.dxf')
})

test('DXF-006: raw R2000 container satisfies the CAD minimum before reader default synthesis', () => {
  // Autodesk symbol-table example/common codes and ezdxf minimum R13+ container.
  // Inspect raw pairs independently of importSectionDxf and any forgiving CAD reader.
  const text = value(buildSectionDxf(value(importSectionDxf(fixture(hollow+circle(-140,-240,12.5))))))
  const lines = text.trimEnd().split('\r\n')
  const records: Array<{type:string; tags:Array<[number,string]>}> = []
  for(let i=0;i<lines.length;i+=2) {
    const code = Number(lines[i]), content = lines[i+1]
    if(code===0) records.push({type:content,tags:[]})
    else records[records.length-1].tags.push([code,content])
  }
  const tag = (r:typeof records[number], code:number) => r.tags.find(t=>t[0]===code)?.[1]
  assert.deepEqual(records.filter(r=>r.type==='SECTION').map(r=>tag(r,2)),
    ['HEADER','CLASSES','TABLES','BLOCKS','ENTITIES','OBJECTS'])
  const tables = records.filter(r=>r.type==='TABLE')
  assert.deepEqual(tables.map(r=>tag(r,2)),
    ['VPORT','LTYPE','LAYER','STYLE','VIEW','UCS','APPID','DIMSTYLE','BLOCK_RECORD'])
  for(const t of tables) assert.equal(t.tags[0][0],2,'TABLE name must precede its handle')
  for(const [type,names] of [
    ['LTYPE',['BYBLOCK','BYLAYER','CONTINUOUS']], ['LAYER',['0','pm']],
    ['STYLE',['STANDARD']], ['APPID',['ACAD']], ['DIMSTYLE',['STANDARD']],
    ['BLOCK_RECORD',['*Model_Space','*Paper_Space']], ['BLOCK',['*Model_Space','*Paper_Space']]
  ] as const) {
    assert.deepEqual(records.filter(r=>r.type===type).map(r=>tag(r,2)),names)
  }
  const dimstyle = records.find(r=>r.type==='DIMSTYLE')
  assert.ok(dimstyle)
  assert.ok(tag(dimstyle,105),'DIMSTYLE entry uses handle group 105')
  assert.equal(tag(dimstyle,5),undefined)
  const objects = records.filter(r=>tag(r,5)!==undefined || tag(r,105)!==undefined)
    .filter(r=>r.type!=='SECTION')
  const handles = objects.map(r=>tag(r,r.type==='DIMSTYLE'?105:5))
  assert.equal(new Set(handles).size,handles.length,'object handles are unique')
  for(const r of objects) {
    for(const [code,reference] of r.tags.filter(([code])=>[330,340,350].includes(code))) {
      assert.ok(reference==='0' || handles.includes(reference),`${r.type} group ${code} must resolve`)
    }
  }
  const root = records.find(r=>r.type==='DICTIONARY' && tag(r,330)==='0')
  assert.ok(root)
  assert.equal(tag(root,3),'ACAD_GROUP')
  const groups = records.find(r=>r.type==='DICTIONARY' && tag(r,5)===tag(root,350))
  assert.ok(groups)
  assert.equal(tag(groups,330),tag(root,5),'ACAD_GROUP belongs to the root dictionary')
  const header = records[0]
  const seedIndex = header.tags.findIndex(t=>t[0]===9 && t[1]==='$HANDSEED')
  assert.equal(header.tags[seedIndex+1][0],5)
  assert.ok(parseInt(header.tags[seedIndex+1][1],16)>Math.max(...handles.map(h=>parseInt(h ?? '',16))))
  const model = records.find(r=>r.type==='BLOCK_RECORD' && tag(r,2)==='*Model_Space')
  assert.ok(model)
  const geometry = records.filter(r=>['LWPOLYLINE','CIRCLE'].includes(r.type))
  assert.equal(geometry.length,3)
  for(const r of geometry) {
    assert.equal(tag(r,330),tag(model,5))
    assert.equal(tag(r,8),'pm')
  }
})

test('DXF-001: reads legacy POLYLINE/VERTEX/SEQEND and disclosed duplicate closing point', () => {
  const vertices = [...rect(0,0,400,600),[0,0]].map(([x,y])=>`0\nVERTEX\n8\npm\n10\n${x}\n20\n${y}\n30\n0\n`).join('')
  const result = importSectionDxf(fixture(`0\nPOLYLINE\n8\npm\n66\n1\n70\n1\n${vertices}0\nSEQEND\n8\npm\n`))
  assert.equal(value(result).outers[0][0].length,4)
  if (result.ok) assert.equal(result.warnings.length,1)
})

test('DXF-004: explicit units, including ordinary extra HEADER group-2 values', () => {
  const entities = polygon(rect(0,0,400,600))
  failure(fixture(entities,0),'UNITS_REQUIRED')
  failure(fixture(entities,null),'UNITS_REQUIRED')
  const chosen = importSectionDxf(fixture(entities,null),{unitlessMillimetres:true})
  assert.ok(chosen.ok)
  if(chosen.ok) assert.match(chosen.warnings[0],/explicit choice/)
  failure(fixture(entities,6),'UNSUPPORTED_UNITS')
  failure(fixture(entities,4,'9\n$INSUNITS\n70\n4\n'),'FORMAT')
  assert.ok(importSectionDxf(fixture(entities,4,'9\n$DIMSTYLE\n2\nStandard\n')).ok)
})

test('DXF-006: ignores unrelated-layer annotations and rejects unsupported pm entities', () => {
  const result = importSectionDxf(fixture(polygon(rect(0,0,400,600))+'0\nTEXT\n8\nnotes\n1\nAnnotation\n'))
  assert.ok(result.ok)
  if(result.ok) assert.match(result.warnings[0],/Ignored 1/)
  for(const type of ['ARC','SPLINE','INSERT','TEXT','LINE']) failure(fixture(polygon(rect(0,0,400,600))+`0\n${type}\n8\npm\n`),'UNSUPPORTED_ENTITY')
})

test('ENG-GEO-001/002/005: rejects open/ambiguous/touching/intersecting geometry and invalid full disks', () => {
  failure(fixture(polygon(rect(0,0,400,600),'pm',0)),'UNSUPPORTED_ENTITY')
  failure(fixture(polygon([[0,0],[400,600],[0,600],[400,0]])),'INVALID_GEOMETRY')
  failure(fixture(polygon(rect(0,0,400,600))+polygon(rect(0,100,100,100))),'INVALID_GEOMETRY')
  failure(fixture(polygon(rect(0,0,400,600))+polygon(rect(300,300,400,600))),'INVALID_GEOMETRY')
  failure(fixture(hollow+circle(0,0,10)),'INVALID_GEOMETRY')
  failure(fixture(polygon(rect(0,0,400,600))+circle(5,100,10)),'INVALID_GEOMETRY')
  failure(fixture(polygon(rect(0,0,400,600))+circle(100,100,10)+circle(105,100,10)),'INVALID_GEOMETRY')
  failure(fixture(polygon(rect(0,0,400,600))+circle(100,100,0)),'INVALID_GEOMETRY')
})

test('DXF-006: rejects curves, non-flat/OCS/paperspace fields and malformed numbers/records', () => {
  const rectangle = rect(0,0,400,600)
  for (const extra of ['42\n1\n','38\n10\n','39\n2\n','210\n1\n','230\n-1\n','67\n1\n','410\nLayout1\n']) {
    failure(fixture(polygon(rectangle,'pm',1,extra)),'UNSUPPORTED_ENTITY')
  }
  for (const text of [fixture(polygon(rectangle)).replace('10\n0\n','10\n\n'),fixture(polygon(rectangle)).replace('90\n4','90\n3'),fixture(polygon(rectangle)).replace('10\n0\n','10\n1e309\n'),fixture(polygon(rectangle)).replace('0\nEOF\n',''), 'AutoCAD Binary DXF\0',fixture(polygon(rectangle))+'1\ntrailing\n']) failure(text,'FORMAT')
})

test('DXF-006: checks resource limits before topology work', () => {
  failure(' '.repeat(DRAWING_LIMITS.bytes+1),'RESOURCE_LIMIT')
  failure(fixture(polygon(Array.from({length:DRAWING_LIMITS.ringVertices+1},(_,i)=>[i,i%2]))),'RESOURCE_LIMIT')
  failure(fixture(polygon(rect(0,0,400,600))+circle(100,100,10).repeat(DRAWING_LIMITS.rebars+1)),'RESOURCE_LIMIT')
})

test('DXF-005/ENG-MAT-001: first stored steel by ID, existing definitions/defaults preserved and no source mutation', () => {
  const store = createDefaultMaterialStore()
  store.steel = [createKdsRebarSteel({id:7,name:'First grade'},[]),createKdsRebarSteel({id:2,name:'Default grade'},[7])]
  store.defaults.steelMaterialId = 2
  const before = structuredClone(store)
  const drawing = value(importSectionDxf(fixture(hollow+circle(-140,-240,10))))
  const prepared = value(prepareDrawingImport(drawing,store,'kds-2024-stress-strain'))
  assert.equal(prepared.drawing.rebars[0].steelMaterialId,7)
  assert.equal(prepared.materials.concrete,store.concrete)
  assert.equal(prepared.materials.steel,store.steel)
  assert.equal(prepared.materials.defaults.steelMaterialId,2)
  assert.deepEqual(store,before)
  assert.deepEqual(validateGeometryInput(geometryInputFromOuterRings(1,'DXF',prepared.drawing.outers,prepared.drawing.rebars)),[])
})

test('DXF-005: absent families use existing defaults for every selected profile; invalid definitions fail', () => {
  const drawing = value(importSectionDxf(fixture(polygon(rect(0,0,400,600))+circle(100,100,10))))
  for(const profile of CALCULATION_PROFILE_IDS) {
    const result = prepareDrawingImport(drawing,undefined,profile)
    const prepared = value(result)
    assert.equal(prepared.drawing.rebars[0].steelMaterialId,prepared.materials.steel[0].id)
    assert.ok(prepared.materials.concrete)
    if(result.ok) assert.equal(result.warnings.filter(w=>w.startsWith('Created')).length,2)
  }
  const source = createDefaultMaterialStore()
  const noSteel = value(prepareDrawingImport(drawing,{concrete:source.concrete,steel:[]},'kds-2024-stress-strain'))
  assert.equal(noSteel.materials.concrete,source.concrete)
  const noConcrete = value(prepareDrawingImport(drawing,{steel:source.steel},'kds-2024-stress-strain'))
  assert.equal(noConcrete.materials.steel,source.steel)
  source.steel[0].fy = Number.NaN
  const invalid = prepareDrawingImport(drawing,source,'kds-2024-stress-strain')
  assert.equal(invalid.ok,false)
  if(!invalid.ok) assert.equal(invalid.issue.code,'INVALID_MATERIALS')
})
