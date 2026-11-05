import assert from 'node:assert/strict'
import test from 'node:test'
import { createLoadCombination } from '@pm/project'
import {
  currentLoadcaseEvidence,
  currentLoadcaseEvidenceMap,
  currentLoadcaseFrame,
  sameLoadcaseAnalysisInputs,
  loadcaseFrameForTransition,
  sameLoadcaseDemand
} from '../../features/section-editor/results/loadcase-calculation-trace'

test('menu-only navigation retains applied-input identity; every replaced analysis input invalidates reuse', () => {
  const inputs = { surface: {}, section: {}, rebars: [], materialStore: {}, designBasis: {} }
  assert.equal(sameLoadcaseAnalysisInputs(inputs, { ...inputs }), true)
  for (const key of ['surface', 'section', 'rebars', 'materialStore', 'designBasis'] as const) {
    assert.equal(sameLoadcaseAnalysisInputs(inputs, { ...inputs, [key]: {} }), false, key)
  }
})

test('loadcase calculation trace uses stable ID and the complete demand revision', () => {
  const selected = createLoadCombination({ id: 7, name: 'ULS-7', P: 1_200_000, Mx: 80_000_000, My: -35_000_000 })
  const renamed = { ...selected, name: 'Renamed ULS-7' }
  const evidence = { demand: selected, marker: 'current' }

  assert.equal(sameLoadcaseDemand(selected, renamed), true, 'name is presentation, not calculation identity')
  assert.equal(currentLoadcaseEvidence(renamed, evidence), evidence)
})

test('loadcase calculation trace fails closed for another row or an edited demand', () => {
  const selected = createLoadCombination({ id: 7, name: 'ULS-7', P: 1_200_000, Mx: 80_000_000, My: -35_000_000 })
  const otherId = { ...selected, id: 8 }
  const edited = { ...selected, Mx: selected.Mx + 1 }
  const evidence = { demand: selected, marker: 'stale' }

  assert.equal(currentLoadcaseEvidence(otherId, evidence), null)
  assert.equal(currentLoadcaseEvidence(edited, evidence), null)
  assert.equal(currentLoadcaseEvidence(null, evidence), null)
  assert.equal(currentLoadcaseEvidence(selected, null), null)
})

test('loadcase table publishes only evidence for each current demand revision', () => {
  const first = createLoadCombination({ id: 7, name: 'ULS-7', P: 1_200_000, Mx: 80_000_000, My: -35_000_000 })
  const second = createLoadCombination({ id: 8, name: 'ULS-8', P: 900_000, Mx: -20_000_000, My: 45_000_000 })
  const staleFirst = { demand: { ...first, P: first.P - 1 }, marker: 'stale-first' }
  const currentSecond = { demand: second, marker: 'current-second' }
  const orphan = { demand: { ...second, id: 9 }, marker: 'orphan' }

  assert.deepEqual(
    currentLoadcaseEvidenceMap([first, second], {
      [first.id]: staleFirst,
      [second.id]: currentSecond,
      9: orphan
    }),
    { [second.id]: currentSecond }
  )
})

test('loadcase result frames stay hidden until the complete current revision is ready', () => {
  const selected = createLoadCombination({ id: 7, name: 'ULS-7', P: 1_200_000, Mx: 80_000_000, My: -35_000_000 })
  const edited = { ...selected, My: selected.My - 1 }
  const surface = { revision: 'surface-current' }
  const otherSurface = { revision: 'surface-old' }
  const result = { demand: selected, marker: 'result-current' }
  const replacementResult = { demand: selected, marker: 'result-replacement' }
  const frame = { result, selectedLoadcaseId: selected.id, surface, marker: 'frame-current' }

  assert.equal(currentLoadcaseFrame(selected, result, surface, frame), frame)
  assert.equal(currentLoadcaseFrame(edited, result, surface, frame), null, 'edited demand rejects the previous frame')
  assert.equal(currentLoadcaseFrame(selected, replacementResult, surface, frame), null, 'a replacement result must build its own frame')
  assert.equal(currentLoadcaseFrame(selected, result, otherSurface, frame), null, 'a rebuilt surface rejects the previous frame')
  assert.equal(currentLoadcaseFrame({ ...selected, id: 8 }, result, surface, frame), null, 'another selected row rejects the frame')
})

test('loadcase chart transitions retain one coherent previous frame until the next frame is complete', () => {
  const first = createLoadCombination({ id: 7, name: 'ULS-7', P: 1_200_000, Mx: 80_000_000, My: -35_000_000 })
  const second = createLoadCombination({ id: 8, name: 'ULS-8', P: 900_000, Mx: -20_000_000, My: 45_000_000 })
  const surface = { revision: 'surface-current' }
  const firstResult = { demand: first, marker: 'result-first' }
  const firstFrame = { result: firstResult, selectedLoadcaseId: first.id, surface, marker: 'frame-first' }

  assert.deepEqual(
    loadcaseFrameForTransition([first, second], second, null, surface, firstFrame),
    { frame: firstFrame, status: 'previous' }
  )

  const secondResult = { demand: second, marker: 'result-second' }
  const secondFrame = { result: secondResult, selectedLoadcaseId: second.id, surface, marker: 'frame-second' }
  assert.deepEqual(
    loadcaseFrameForTransition([first, second], second, secondResult, surface, secondFrame),
    { frame: secondFrame, status: 'current' }
  )
})

test('edited demands retain only a labelled outgoing frame, never current evidence', () => {
  const first = createLoadCombination({ id: 7, name: 'ULS-7', P: 1_200_000, Mx: 80_000_000, My: -35_000_000 })
  const second = createLoadCombination({ id: 8, name: 'ULS-8', P: 900_000, Mx: -20_000_000, My: 45_000_000 })
  const surface = { revision: 'surface-current' }
  const result = { demand: first, marker: 'result-first' }
  const frame = { result, selectedLoadcaseId: first.id, surface, marker: 'frame-first' }

  assert.deepEqual(
    loadcaseFrameForTransition([{ ...first, Mx: first.Mx + 1 }, second], second, null, surface, frame),
    { frame, status: 'previous' }
  )
  const edited = { ...first, Mx: first.Mx + 1 }
  assert.equal(currentLoadcaseEvidence(edited, result), null)
  assert.equal(currentLoadcaseFrame(edited, result, surface, frame), null)
  assert.deepEqual(currentLoadcaseEvidenceMap([edited, second], { [first.id]: result }), {})
  assert.deepEqual(loadcaseFrameForTransition([edited, second], edited, null, surface, frame),
    { frame, status: 'previous' })
  assert.deepEqual(loadcaseFrameForTransition([second], second, null, surface, frame),
    { frame: null, status: 'pending' }, 'deleted outgoing row must withdraw its frame')
  assert.deepEqual(loadcaseFrameForTransition([first, second], null, null, surface, frame),
    { frame: null, status: 'pending' }, 'a missing selection has no transition')
  assert.deepEqual(
    loadcaseFrameForTransition([first, second], second, null, { revision: 'surface-new' }, frame),
    { frame: null, status: 'pending' }
  )
})
