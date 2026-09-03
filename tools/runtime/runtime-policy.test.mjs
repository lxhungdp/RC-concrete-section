import { strict as assert } from 'node:assert'
import test from 'node:test'
import { assertSupportedRuntime, isVersionInMajorLine } from './runtime-policy.mjs'

test('accepts stable patch releases within the declared Node.js and npm major lines', () => {
  assert.equal(isVersionInMajorLine('24.19.0', '24.x'), true)
  assert.equal(isVersionInMajorLine('v24.20.0', '24.x'), true)
  assert.doesNotThrow(() =>
    assertSupportedRuntime({
      supportedNode: '24.x',
      supportedNpm: '11.x',
      actualNode: '24.19.0',
      actualNpm: '11.7.0'
    })
  )
})

test('rejects Node.js 20 and 22 even when npm is supported', () => {
  for (const actualNode of ['20.19.0', '22.22.0']) {
    assert.throws(
      () =>
        assertSupportedRuntime({
          supportedNode: '24.x',
          supportedNpm: '11.x',
          actualNode,
          actualNpm: '11.19.0'
        }),
      /Unsupported runtime/
    )
  }
})

test('rejects npm outside major 11 and missing npm provenance', () => {
  for (const actualNpm of ['10.8.2', '12.0.0', undefined]) {
    assert.throws(
      () =>
        assertSupportedRuntime({
          supportedNode: '24.x',
          supportedNpm: '11.x',
          actualNode: '24.20.0',
          actualNpm
        }),
      /Unsupported runtime/
    )
  }
})

test('rejects malformed or exact supported-version declarations', () => {
  for (const versionLine of ['24.20.0', '^24.0.0', '24']) {
    assert.throws(() => isVersionInMajorLine('24.20.0', versionLine), /major version line/)
  }
})
