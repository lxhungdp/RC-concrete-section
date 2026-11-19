import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'

import { ADSEC_MANIFEST } from './manifest'
import { parseAdsecReport, sourceNumber } from './parser'

const ROOT = process.cwd()

test('source-number precision follows the printed decimal and exponent', () => {
  assert.deepEqual(sourceNumber('1.254E+6'), { raw: '1.254E+6', value: 1_254_000, halfUnit: 500 })
  assert.deepEqual(sourceNumber('-720.4E-6'), { raw: '-720.4E-6', value: -0.0007204, halfUnit: 5e-8 })
  assert.deepEqual(sourceNumber('2250.'), { raw: '2250.', value: 2250, halfUnit: 0.5 })
})

test('all twelve immutable AdSec reports parse with their declared counts and solved identities', () => {
  assert.equal(ADSEC_MANIFEST.length, 12)
  for (const entry of ADSEC_MANIFEST) {
    const report = parseAdsecReport(entry, resolve(ROOT, entry.file))
    assert.equal(report.sourceHash, entry.sha256, entry.id)
    assert.equal(report.nodes.length, entry.expectedNodes, entry.id)
    assert.equal(report.bars.length, entry.expectedBars, entry.id)
    assert.equal(report.loads.length, entry.expectedCases, entry.id)
    assert.equal(report.summaries.length, entry.expectedCases, entry.id)

    const solved = report.summaries.filter((summary) => summary.status === 'solved').map((summary) => summary.id)
    assert.equal(solved.length, entry.expectedSolvedCases, entry.id)
    assert.deepEqual(report.planes.map((plane) => plane.id), solved, entry.id)
    assert.equal(report.concretePoints.length, entry.expectedSolvedCases * entry.expectedNodes, entry.id)
    assert.equal(report.rebarPoints.length, entry.expectedSolvedCases * entry.expectedBars, entry.id)
  }
})

test('source axes and units are normalized without using the printed utilization columns', () => {
  const p16 = parseAdsecReport(ADSEC_MANIFEST[0]!, resolve(ROOT, ADSEC_MANIFEST[0]!.file))
  assert.equal(p16.loads[0]?.mx.value, 42_950)
  assert.equal(p16.loads[0]?.my.value, 286_600)
  assert.ok(Math.abs((p16.planes[0]?.kx.value ?? 0) - 80.53e-9) < 1e-22)
  assert.ok(Math.abs((p16.planes[0]?.ky.value ?? 0) - 0.002422 / 1000) < 1e-22)

  const pylon = parseAdsecReport(ADSEC_MANIFEST[8]!, resolve(ROOT, ADSEC_MANIFEST[8]!.file))
  assert.equal(pylon.loads[0]?.mx.value, 68_060)
  assert.equal(pylon.loads[0]?.my.value, 0)
  assert.ok(Math.abs((pylon.planes[0]?.kx.value ?? 0) - 7.539e-6) < 1e-20)
  assert.ok(Math.abs((pylon.planes[0]?.ky.value ?? 0) - 231.4e-12) < 1e-24)
})

test('source mutation and manifest count drift fail closed before comparison', () => {
  const entry = ADSEC_MANIFEST[0]!
  const source = resolve(ROOT, entry.file)
  assert.throws(
    () => parseAdsecReport({ ...entry, sha256: '0'.repeat(64) }, source),
    /source hash .* does not match manifest/u
  )
  assert.throws(
    () => parseAdsecReport({ ...entry, expectedBars: entry.expectedBars + 1 }, source),
    /expected 409 bars, parsed 408/u
  )
})

test('ACI No Solution and nominal-strength factors remain typed source evidence', () => {
  const entry = ADSEC_MANIFEST.find((candidate) => candidate.id === 'p16-aci')!
  const report = parseAdsecReport(entry, resolve(ROOT, entry.file))
  assert.deepEqual(
    report.summaries.filter((summary) => summary.status === 'no-solution').map((summary) => summary.id),
    [1, 6]
  )
  const solved = report.summaries.find((summary) => summary.id === 2)
  assert.equal(solved?.status, 'solved')
  if (solved?.status === 'solved') assert.equal(solved.strengthFactor?.value, 0.9)
})
