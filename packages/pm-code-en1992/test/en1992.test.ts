import assert from 'node:assert/strict'
import test from 'node:test'
import {
  en1992ConcreteDesignStrength,
  en1992ParabolicRectangularParameters,
  en1992SteelDesignStrength
} from '../src/index'

test('EN 1992 normal-strength parabolic-rectangular parameters use Table 3.1 values', () => {
  assert.deepEqual(en1992ParabolicRectangularParameters(30), {
    n: 2,
    epsC2: 0.002,
    epsCu2: 0.0035
  })
})

test('EN 1992 high-strength parameters vary continuously above 50 MPa', () => {
  const at50 = en1992ParabolicRectangularParameters(50)
  const at60 = en1992ParabolicRectangularParameters(60)
  assert.ok(at60.epsC2 > at50.epsC2)
  assert.ok(at60.epsCu2 < at50.epsCu2)
  assert.ok(at60.n < at50.n)
})

test('EN 1992 recommended partial factors create design strengths', () => {
  assert.equal(en1992ConcreteDesignStrength(30), 20)
  assert.equal(en1992SteelDesignStrength(500), 500 / 1.15)
})

test('EN 1992 preview rejects strengths outside its declared range', () => {
  assert.throws(() => en1992ParabolicRectangularParameters(100), RangeError)
})
