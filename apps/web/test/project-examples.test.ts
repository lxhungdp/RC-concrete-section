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
