import assert from 'node:assert/strict'
import test from 'node:test'
import { geometryInputRebars, sectionGeometryFromGeometryInput } from '@pm/geometry'
import { createKdsBasicDesignBasis } from '@pm/design'
import { createDefaultAnalysisOptions } from '@pm/project'
import { axialCapExcludedPaths, buildDesignPreviewSurfaceFromPrepared, buildExactDirectionCurveFromPrepared,
  buildDirectMeridianSection, intersectSurfaceWithDemandRay, prepareAnalysis, type PreviewSurfaceDataset,
  type PreviewSurfacePoint } from '../src/index'
import { AnalysisInputError } from '../src/analysis-error'
import { clipDesignSurfaceAtAxialCap } from '../src/axial-cap'
import { BENCH_CASES } from '../bench/sections'

const point = (id: number, P: number, Mx: number, My: number): PreviewSurfacePoint => {
  const zero = { P:0, Mx:0, My:0 }
  return { id:String(id), P,Mx,My, beta:0, station:id, stationId:`station-${id}`, surfaceRole:'physical-state',
    state:{ e0:0.001,kx:0,ky:0 }, ledger:{ concrete:{P,Mx,My},steelGross:zero,displacedConcrete:zero,
      steel:zero,total:{P,Mx,My} } }
}

test('ENG-RES-001: an exact meridian inserts its affine Pmax crossing and keeps every lower point', () => {
  const source = [point(0,20,0,0),point(1,14,20,4),point(2,7,35,7),point(3,-3,0,0)]
  const data:PreviewSurfaceDataset = { points:source, directions:[0],stations:[] }
  const capped = clipDesignSurfaceAtAxialCap(data,10,20,0.5)
  const cut = capped.points.find(p=>p.surfaceRole==='axial-cap')
  assert.ok(cut)
  const t = (10-14)/(7-14)
  assert.equal(cut.P,10)
  assert.equal(cut.Mx,20+t*15)
  assert.equal(cut.My,4+t*3)
  assert.equal(cut.stationId,null)
  assert.equal(capped.points.find(p=>p.id==='2'),source[2])
  assert.equal(capped.points.find(p=>p.id==='3'),source[3])
  const dotted = axialCapExcludedPaths([source],10)
  assert.deepEqual(dotted[0].at(-1),{ P:cut.P,Mx:cut.Mx,My:cut.My },'both styles use the same cut point')
})

test('ENG-RES-001: clipping an analytical box preserves its sides and fails closed for invalid topology', () => {
  const points = [
    point(0,-20,-10,-6),point(1,-20,10,-6),point(2,-20,10,6),point(3,-20,-10,6),
    point(4,20,-10,-6),point(5,20,10,-6),point(6,20,10,6),point(7,20,-10,6)
  ]
  const triangles = [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],
    [1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]].map(([a,b,c])=>({a,b,c}))
  const original: PreviewSurfaceDataset = { points,triangles,directions:[0,90,180,270],stations:[] }
  const clipped = clipDesignSurfaceAtAxialCap(original,10,20,0.5)
  const fixture = BENCH_CASES[0]
  const prepared = prepareAnalysis(sectionGeometryFromGeometryInput(fixture.geometry),geometryInputRebars(fixture.geometry),fixture.materials)
  const metadata = buildDesignPreviewSurfaceFromPrepared(prepared,fixture.materials,createKdsBasicDesignBasis(),createDefaultAnalysisOptions())
  const box = { ...metadata,...clipped,bounds:{P:[-20,10] as [number,number],Mx:[-10,10] as [number,number],My:[-6,6] as [number,number]} }
  for (const demand of [{P:30,Mx:4,My:1},{P:1,Mx:8,My:5},{P:-30,Mx:4,My:1}]) {
    const expected = Math.min((demand.P>0?10:20)/Math.abs(demand.P),10/Math.abs(demand.Mx),6/Math.abs(demand.My))
    const actual = intersectSurfaceWithDemandRay(box,demand)
    assert.ok(actual)
    assert.ok(Math.abs(actual.lambda-expected)<1e-12,'independent analytical box/plane intersection')
  }
  const invalid = (error: unknown) => error instanceof AnalysisInputError && error.code==='INVALID_RESISTANCE_SURFACE'
  assert.throws(()=>clipDesignSurfaceAtAxialCap({...original,triangles:[]},10,20,0.5),invalid)
  assert.throws(()=>clipDesignSurfaceAtAxialCap({...original,triangles:triangles.slice(1)},10,20,0.5),invalid)
  assert.throws(()=>clipDesignSurfaceAtAxialCap({...original,points:[{...points[0],P:NaN},...points.slice(1)]},10,20,0.5),invalid)
})

test('ENG-RES-001: cap geometry equals the half-space intersection for the structural matrix', () => {
  for (const fixture of BENCH_CASES) {
    const prepared = prepareAnalysis(sectionGeometryFromGeometryInput(fixture.geometry),geometryInputRebars(fixture.geometry),fixture.materials)
    const basis = createKdsBasicDesignBasis()
    const options = createDefaultAnalysisOptions()
    const surface = buildDesignPreviewSurfaceFromPrepared(prepared,fixture.materials,basis,options)
    const original = surface.beforeAxialCap
    assert.ok(original,fixture.key)
    const cap = surface.bounds.P[1]
    const uncut = { ...surface,points:original.points,triangles:original.triangles }
    for (const p of original.points.filter(p=>p.P<cap)) assert.equal(surface.points.find(v=>v.id===p.id),p)
    assert.ok(surface.points.every(p=>p.P<=cap))
    const edges = new Map<string,number>()
    for (const t of surface.triangles??[]) for (const [a,b] of [[t.a,t.b],[t.b,t.c],[t.c,t.a]]) {
      const key = a<b?`${a}:${b}`:`${b}:${a}`; edges.set(key,(edges.get(key)??0)+1)
    }
    assert.ok([...edges.values()].every(count=>count===2),`${fixture.key}: closed cap topology`)
    const momentScale = Math.max(...surface.bounds.Mx.map(Math.abs),...surface.bounds.My.map(Math.abs))
    for (let deg=0;deg<360;deg+=30) for (const p of [-cap,cap,2*cap]) for (const m of [0.1,0.35,0.7,1.2]) {
      const theta=deg*Math.PI/180
      const d={P:p,Mx:m*momentScale*Math.cos(theta),My:m*momentScale*Math.sin(theta)}
      const before=intersectSurfaceWithDemandRay(uncut,d); const after=intersectSurfaceWithDemandRay(surface,d)
      assert.ok(before&&after,fixture.key)
      const expected=p>0?Math.min(before.lambda,cap/p):before.lambda
      assert.ok(Math.abs(after.lambda/expected-1)<=1e-10,`${fixture.key} ${deg}: independent half-space/ray oracle`)
    }
    const exact=buildExactDirectionCurveFromPrepared(prepared,fixture.materials,basis,options,17.35*Math.PI/180)
    assert.ok(exact.beforeAxialCap)
    const solid=buildDirectMeridianSection(exact.designCurve??[],17.35,false).primary
    const dotted=axialCapExcludedPaths([exact.beforeAxialCap],cap)
    const cuts=dotted.flat().filter(p=>p.P===cap)
    for (const c of cuts) assert.ok(solid.some(p=>p.P===c.P&&p.Mx===c.Mx&&p.My===c.My),
      `${fixture.key}: exact-beta styles meet at the identical source-edge crossing`)
  }
})
