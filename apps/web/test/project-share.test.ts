import assert from 'node:assert/strict'
import test from 'node:test'
import { createDefaultProjectInformation, parseProjectDocument } from '@pm/project'
import { PROJECT_EXAMPLES } from '../features/section-editor/project-examples'
import {
  createProjectShareUrl,
  decodeProjectSharePayload,
  encodeProjectSharePayload,
  projectSharePayloadFromHash
} from '../features/section-editor/project/project-share'

test('self-contained project links round-trip every bundled example', async () => {
  for (const example of PROJECT_EXAMPLES) {
    const parsed = parseProjectDocument(example.document)
    assert.equal(parsed.ok, true, `${example.id} fixture must be valid`)
    if (!parsed.ok) continue

    const payload = await encodeProjectSharePayload(parsed.document)
    const decoded = await decodeProjectSharePayload(payload)
    const decodedProject = parseProjectDocument(decoded)
    assert.equal(decodedProject.ok, true, `${example.id} shared payload must be valid`)
    if (!decodedProject.ok) continue

    assert.deepEqual(decodedProject.document.inputs, parsed.document.inputs, `${example.id} must preserve every calculation input`)
    assert.equal(decodedProject.document.meta.id, parsed.document.meta.id)
    assert.equal(decodedProject.document.meta.name, parsed.document.meta.name)
    assert.equal(decodedProject.document.meta.createdAt, parsed.document.meta.createdAt)
    assert.equal(decodedProject.document.meta.updatedAt, parsed.document.meta.updatedAt)
    assert.deepEqual(decodedProject.document.meta.information, createDefaultProjectInformation())
  }
})

test('share URL preserves the page URL and stores the payload only in the fragment', async () => {
  const parsed = parseProjectDocument(PROJECT_EXAMPLES[0]!.document)
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return

  const shareUrl = await createProjectShareUrl(parsed.document, 'https://example.com/design?mode=review')
  const url = new URL(shareUrl)
  assert.equal(url.origin, 'https://example.com')
  assert.equal(url.pathname, '/design')
  assert.equal(url.search, '?mode=review')
  assert.ok(projectSharePayloadFromHash(url.hash)?.startsWith('v1.'))
})

test('shared project links preserve the project name but omit Project Information', async () => {
  const parsed = parseProjectDocument(PROJECT_EXAMPLES[0]!.document)
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return

  parsed.document.meta.name = 'Dự án cột – 서울'
  const firstInformation = {
    client: 'Công ty Khách hàng',
    company: 'Kết cấu Việt Nam',
    designedBy: 'Nguyễn Văn A',
    checkedBy: '김철수',
    address: 'Hà Nội, Việt Nam',
    date: '2026-08-10'
  }
  parsed.document.meta.information = firstInformation

  const firstPayload = await encodeProjectSharePayload(parsed.document)
  parsed.document.meta.information = {
    ...firstInformation,
    client: 'A completely different client',
    company: 'A different company'
  }
  const secondPayload = await encodeProjectSharePayload(parsed.document)
  assert.equal(secondPayload, firstPayload, 'Project Information must not affect the shared payload')

  const decoded = await decodeProjectSharePayload(firstPayload)
  const reopened = parseProjectDocument(decoded)
  assert.equal(reopened.ok, true)
  if (!reopened.ok) return
  assert.equal(reopened.document.meta.name, parsed.document.meta.name)
  assert.deepEqual(reopened.document.meta.information, createDefaultProjectInformation())
})

test('share decoder rejects unsupported and corrupted payloads', async () => {
  await assert.rejects(() => decodeProjectSharePayload('v2.abc'), /unsupported format/)
  await assert.rejects(() => decodeProjectSharePayload('v1.bm90LWd6aXA'), /could not be decompressed/)
})
