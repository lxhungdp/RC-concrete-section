import assert from 'node:assert/strict'
import test from 'node:test'
import { parseProjectDocument } from '@pm/project'
import { PROJECT_EXAMPLES } from '../features/section-editor/project-examples'
import {
  MAX_RECENT_PROJECTS,
  recentProjectFromRaw,
  recentProjectsFromStorage,
  serializeRecentProjects,
  upsertRecentProject,
  type RecentProject
} from '../features/section-editor/recent-project'

test('every project-menu example is a valid version-1 project document', () => {
  assert.ok(PROJECT_EXAMPLES.length >= 5)
  assert.equal(new Set(PROJECT_EXAMPLES.map((example) => example.id)).size, PROJECT_EXAMPLES.length)

  for (const example of PROJECT_EXAMPLES) {
    const parsed = parseProjectDocument(example.document)
    assert.equal(parsed.ok, true, parsed.ok ? example.label : `${example.label}: ${parsed.error}`)
    if (parsed.ok) assert.equal(parsed.document.version, 1)
  }
})

test('the P16 UMD project replaces the KDS equivalent-stress rectangle example', () => {
  assert.equal(PROJECT_EXAMPLES.some((example) => example.id === 'kds-eq-rectangle'), false)
  const p16 = PROJECT_EXAMPLES.find((example) => example.id === 'en-umd-p16')
  assert.ok(p16)
  const parsed = parseProjectDocument(p16.document)
  assert.equal(parsed.ok, true, parsed.ok ? 'P16 UMD example parsed' : parsed.error)
  if (!parsed.ok) return
  assert.equal(parsed.document.inputs.calculationProfileId, 'en-1992-1-1-2004-stress-strain')
  assert.equal(parsed.document.inputs.geometry.rebars.length, 408)
  assert.equal(parsed.document.inputs.loadings.combinations.length, 6)
})

test('ENVICO is a KDS stress-strain project-menu example', () => {
  const envico = PROJECT_EXAMPLES.find((example) => example.id === 'kds-stress-strain-envico')
  assert.ok(envico)
  assert.equal(envico.label, 'ENVICO')
  const parsed = parseProjectDocument(envico.document)
  assert.equal(parsed.ok, true, parsed.ok ? 'ENVICO example parsed' : parsed.error)
  if (!parsed.ok) return
  assert.deepEqual(parsed.warnings, [])
  assert.equal(parsed.document.meta.name, 'ENVICO')
  assert.equal(parsed.document.inputs.calculationProfileId, 'kds-2024-stress-strain')
  assert.equal(parsed.document.inputs.analysis.methodId, 'strain-domain-surface-v1')
  assert.equal(parsed.document.inputs.geometry.outers.length, 7)
  assert.equal(parsed.document.inputs.geometry.outers.reduce((sum, outer) => sum + outer.holes.length, 0), 1)
  assert.equal(parsed.document.inputs.geometry.rebars.length, 226)
  assert.equal(parsed.document.inputs.loadings.combinations.length, 2)
})

test('Hi is a KDS stress-strain project-menu example', () => {
  const hi = PROJECT_EXAMPLES.find((example) => example.id === 'kds-stress-strain-hi')
  assert.ok(hi)
  assert.equal(hi.label, 'Hi')
  const parsed = parseProjectDocument(hi.document)
  assert.equal(parsed.ok, true, parsed.ok ? 'Hi example parsed' : parsed.error)
  if (!parsed.ok) return
  assert.deepEqual(parsed.warnings, [])
  assert.equal(parsed.document.meta.name, 'Hi')
  assert.equal(parsed.document.inputs.calculationProfileId, 'kds-2024-stress-strain')
  assert.equal(parsed.document.inputs.analysis.methodId, 'strain-domain-surface-v1')
  assert.equal(parsed.document.inputs.geometry.outers.length, 3)
  assert.equal(parsed.document.inputs.geometry.outers.reduce((sum, outer) => sum + outer.holes.length, 0), 0)
  assert.equal(parsed.document.inputs.geometry.rebars.length, 207)
  assert.equal(parsed.document.inputs.loadings.combinations.length, 1)
})

test('realistic reinforced sections replace the four simplified equivalent-stress menu examples', () => {
  for (const removedId of ['kds-eq-hollow', 'kds-eq-l-shape', 'kds-eq-two-regions', 'aci-eq-rectangle']) {
    assert.equal(PROJECT_EXAMPLES.some((example) => example.id === removedId), false)
  }
  const expected = [
    { id: 'kds-real-chamfered-hollow', profile: 'kds-142020-equivalent-block', bars: 44, outerPoints: 8, holes: 1 },
    { id: 'kds-real-two-circular-voids', profile: 'kds-142020-equivalent-block', bars: 82, outerPoints: 8, holes: 2 },
    { id: 'kds-real-h-section', profile: 'kds-142020-equivalent-block', bars: 42, outerPoints: 12, holes: 0 },
    { id: 'aci-real-circular-annulus', profile: 'aci-318-19-22-equivalent-block', bars: 36, outerPoints: 72, holes: 1 }
  ] as const
  for (const item of expected) {
    const example = PROJECT_EXAMPLES.find((candidate) => candidate.id === item.id)
    assert.ok(example, item.id)
    const parsed = parseProjectDocument(example.document)
    assert.equal(parsed.ok, true, parsed.ok ? `${item.id} parsed` : parsed.error)
    if (!parsed.ok) continue
    assert.equal(parsed.document.inputs.calculationProfileId, item.profile)
    assert.equal(parsed.document.inputs.geometry.rebars.length, item.bars)
    assert.equal(parsed.document.inputs.geometry.outers[0]?.points.length, item.outerPoints)
    assert.equal(parsed.document.inputs.geometry.outers[0]?.holes.length, item.holes)
  }
})

test('Recent accepts current version-1 projects and rejects invalid local data', () => {
  const recent = recentProjectFromRaw(PROJECT_EXAMPLES[0]!.document)
  assert.ok(recent)
  assert.equal(recentProjectFromRaw('{"version":0}'), null)
  assert.equal(recentProjectFromRaw('not json'), null)
})

test('Recent stores the five most recently used distinct projects', () => {
  const parsed = parseProjectDocument(PROJECT_EXAMPLES[0]!.document)
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return

  let recents: RecentProject[] = []
  for (let index = 0; index < MAX_RECENT_PROJECTS + 1; index += 1) {
    const document = structuredClone(parsed.document)
    document.meta.id = index + 1
    document.meta.name = `Recent ${index + 1}`
    document.meta.createdAt = `2026-08-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`
    document.meta.updatedAt = document.meta.createdAt
    const recent = recentProjectFromRaw(document)
    assert.ok(recent)
    if (recent) recents = upsertRecentProject(recents, recent)
  }

  assert.equal(recents.length, MAX_RECENT_PROJECTS)
  assert.deepEqual(recents.map((recent) => recent.id), [6, 5, 4, 3, 2])

  const updatedDocument = structuredClone(parsed.document)
  updatedDocument.meta.id = 4
  updatedDocument.meta.name = 'Recent 4 updated'
  updatedDocument.meta.createdAt = '2026-08-04T00:00:00.000Z'
  updatedDocument.meta.updatedAt = '2026-08-11T00:00:00.000Z'
  const updated = recentProjectFromRaw(updatedDocument)
  assert.ok(updated)
  if (!updated) return

  recents = upsertRecentProject(recents, updated)
  assert.equal(recents.length, MAX_RECENT_PROJECTS)
  assert.equal(recents[0]?.name, 'Recent 4 updated')
  assert.deepEqual(recents.map((recent) => recent.id), [4, 6, 5, 3, 2])

  const restored = recentProjectsFromStorage(serializeRecentProjects(recents))
  assert.deepEqual(restored.map((recent) => recent.id), [4, 6, 5, 3, 2])
  assert.deepEqual(recentProjectsFromStorage(updated.raw).map((recent) => recent.id), [4])
  assert.deepEqual(recentProjectsFromStorage('not json'), [])
})
