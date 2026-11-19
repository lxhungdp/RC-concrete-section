import assert from 'node:assert/strict'
import test from 'node:test'
import { axialCapExcludedPaths } from '../src/index'

test('ENG-RES-001: excluded paths clip exactly at Pmax without drawing permitted portions', () => {
  const input = [[{ P: 0, Mx: 0, My: 0 }, { P: 20, Mx: 40, My: -20 }, { P: 0, Mx: 80, My: -40 }]]
  const before = JSON.stringify(input)
  assert.deepEqual(axialCapExcludedPaths(input, 10), [[
    { P: 10, Mx: 20, My: -10 }, input[0][1], { P: 10, Mx: 60, My: -30 }
  ]])
  assert.equal(JSON.stringify(input), before)
  assert.deepEqual(axialCapExcludedPaths(input, 20), [])
  assert.deepEqual(axialCapExcludedPaths([[
    { P: 20, Mx: 0, My: 0 }, { P: 0, Mx: 20, My: 40 }, { P: 20, Mx: 40, My: 80 }
  ]], 10), [
    [{ P: 20, Mx: 0, My: 0 }, { P: 10, Mx: 10, My: 20 }],
    [{ P: 10, Mx: 30, My: 60 }, { P: 20, Mx: 40, My: 80 }]
  ])
  assert.throws(() => axialCapExcludedPaths(input, Number.NaN), RangeError)
  assert.throws(() => axialCapExcludedPaths([[input[0][0], { P: Infinity, Mx: 1, My: 2 }]], 10), RangeError)
})
