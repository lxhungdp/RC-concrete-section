import assert from 'node:assert/strict'
import test from 'node:test'
import { curvePointCriteria, plottedPointsText, type PlottedTrace2D } from '../../features/section-editor/results/demand-chart-text'

const units = { moment: 'kN·m', force: 'kN' }
const meta = { resistanceStage: 'design', resultantColumns: { Mx: 0, My: 1, MR: 2, P: 'y' } }
const compact = (text: string) => text.split('\n').map(line => line.split('\t').map(cell => cell.trimEnd()).join('\t')).join('\n')
const rows = (text: string) => text.split('\n').filter(line => {
  const cells = line.split('\t'); return cells.length === 6 && Number.isInteger(Number(cells[0])) && cells.slice(2).every(cell => cell !== '' && Number.isFinite(Number(cell)))
}).map(line => compact(line).split('\t').slice(2).join('\t'))

test('Data has only four engineering columns with distinct Nominal/Design symbols', () => {
  const data: PlottedTrace2D[] = [
    { x: [-5], y: [12], customdata: [[-3,4,5]], meta },
    { x: [1], y: [10], customdata: [[3,-4,5]], meta: { ...meta, resistanceStage: 'nominal' } },
    { name: 'Load path', x: [0,5], y: [0,12], customdata: [['private']], meta: { raw: 'JSON internals' } }
  ]
  const output = compact(plottedPointsText(data, units))
  assert.match(output, /^PREVIEW\n\nNominal\nN#\tCriteria\tMnx \(kN·m\)\tMny \(kN·m\)\tMn \(kN·m\)\tP \(kN\)/)
  assert.match(output, /Design\nN#\tCriteria\tMrx \(kN·m\)\tMry \(kN·m\)\tMr \(kN·m\)\tP \(kN\)/)
  assert.deepEqual(rows(output), ['3\t-4\t5\t10','-3\t4\t5\t12'])
  assert.doesNotMatch(output, /JSON|custom|Series|Mode|Index|Path|private|Load path/)
})

test('Data retains resultant magnitude on a projected theta cut and negative plotted branch', () => {
  const output = plottedPointsText([{ x: [-1,2], y: [10,20], customdata: [[-3,4,5],[6,-8,10]],
    meta: { ...meta, dataLabel: 'θ cut' } }], units)
  assert.deepEqual(rows(output), ['-3\t4\t5\t10','6\t-8\t10\t20'])
  assert.match(output, /Design — θ cut/)
})

test('Data preserves precision, signed zero, closing rows and blank path breaks', () => {
  const trace: PlottedTrace2D = { x: [-0,1.2345678901234567,-0,null,4,4], y: [0,-12.345678901234567,0,null,5,5],
    customdata: [[-0,0,0],[1.2345678901234567,-2,2.351],[-0,0,0],null,[3,4,5],[3,4,5]],meta }
  const output=compact(plottedPointsText([trace],units))
  assert.ok(output.includes('-0\t0\t0\t0'))
  assert.ok(output.includes('1.2345678901234567\t-2\t2.351\t-12.345678901234567'))
  assert.ok(output.includes('3\t—\t-0\t0\t0\t0\n\n5\t—\t3\t4\t5\t5\n6\t—\t3\t4\t5\t5'))
  assert.equal(rows(output).length,5)
  assert.equal(trace.x?.[3],null)
})

test('Fixed-P supplies the original signed components, magnitude and axial level in selected units', () => {
  const trace: PlottedTrace2D={x:new Float64Array([3,-6]),y:new Float64Array([-4,8]),customdata:[[5,-20],[10,-20]],
    meta:{resistanceStage:'design',resultantColumns:{Mx:'x',My:'y',MR:0,P:1}}}
  const output=plottedPointsText([trace],{moment:'kip·ft',force:'kip'})
  assert.deepEqual(rows(output),['3\t-4\t5\t-20','-6\t8\t10\t-20'])
  assert.match(output,/Mrx \(kip·ft\)/)
  assert.match(output,/P \(kip\)/)
})

test('Hidden, marker-only and invalid rows are omitted; excluded geometry remains qualified', () => {
  const source={x:[1],y:[2],customdata:[[3,4,5]],meta}
  const output=plottedPointsText([{...source,visible:false},{...source,visible:'legendonly'},
    {name:'Marker',x:[1],y:[2]}, {...source,meta:{...meta,dataLabel:'before Pmax (excluded)'}},
    {...source,x:[NaN]}],units)
  assert.equal(rows(output).length,1)
  assert.match(output,/before Pmax \(excluded\)/)
  assert.doesNotMatch(output,/NaN|Marker/)
})

test('Long curves retain every row without decimation', () => {
  const x=Array.from({length:5000},(_,i)=>i/7)
  const output=compact(plottedPointsText([{x,y:x,customdata:x.map(v=>[v,0,v]),meta}],units))
  assert.equal(rows(output).length,5000)
  assert.ok(output.includes(`${x[4999]}\t0\t${x[4999]}\t${x[4999]}`))
})

test('Loading and empty resistance data remain distinct', () => {
  assert.match(plottedPointsText(undefined,units),/loading/)
  assert.match(plottedPointsText([],units),/No resistance-curve points/)
})

test('N# retains plotted point identity across gaps, and Criteria uses the returned stage label', () => {
  const source={x:[1,null,3],y:[10,null,30],customdata:[[3,4,5,'εs / εy = 1'],null,[-6,8,10,'Pmax intersection']],
    meta:{...meta,resultantColumns:{...meta.resultantColumns,Criteria:3}}}
  const output=compact(plottedPointsText([source],units))
  assert.ok(output.includes('1\tεs / εy = 1\t3\t4\t5\t10'))
  assert.ok(output.includes('3\tPmax intersection\t-6\t8\t10\t30'))
  const stations=[{id:'station-1',label:'c / D = 2'}]
  assert.equal(curvePointCriteria('station-1','physical-station',stations),'c / D = 2')
  assert.equal(curvePointCriteria(null,'cap-edge',stations),'Pmax intersection')
  assert.equal(curvePointCriteria('station-1','axial-center',stations),'Axial center')
  assert.equal(curvePointCriteria(null,'surface-cut',stations),'Surface intersection')
  assert.equal(curvePointCriteria('unknown','physical-station',stations),'—')
})
