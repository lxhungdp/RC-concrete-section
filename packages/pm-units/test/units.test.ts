import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { UNIT_PRESETS, commitQuantity, convertUnit, editableQuantity, formatInputQuantity, formatQuantity, fromCanonical,
  parseNumericText, parseUnitSelection, quantityUnit, selectUnit, toCanonical, type Quantity } from '../src/index'

test('UNITS-001/004: independent NIST anchors and dimensional powers in the P-M canonical system', () => {
  assert.equal(convertUnit('length', 1, 'in', 'mm'), 25.4)
  assert.equal(convertUnit('force', 1, 'lbf', 'N'), 4.4482216152605)
  // Independent decimal multiplication of NIST exact definitions gives 1355817.9483314004.
  // Four binary64 rounding units bound the source-scale ratio and final multiplication.
  assert.ok(Math.abs(convertUnit('moment', 1, 'kip·ft', 'N·mm') - 1355817.9483314004) <= 4 * Number.EPSILON * 1355817.9483314004)
  assert.ok(Math.abs(convertUnit('stress', 1, 'ksi', 'MPa') - 6.894757293168361) < 2e-15)
  assert.ok(Math.abs(convertUnit('area', 1, 'in²', 'mm²') - 645.16) < 2e-13)
  assert.ok(Math.abs(convertUnit('inertia', 1, 'in⁴', 'mm⁴') - 416231.4256) < 1e-9)
  assert.equal(convertUnit('curvature', 1, 'mm⁻¹', 'in⁻¹'), 25.4)
  assert.ok(Math.abs(convertUnit('density', 1, 'lbm/ft³', 'kg/m³') - 16.01846337396014) < 1e-13)
})

test('UNITS-002: immutable independent groups and versioned strict preferences', () => {
  const custom = selectUnit(selectUnit(UNIT_PRESETS.metric, 'length', 'ft'), 'modulus', 'GPa')
  assert.equal(quantityUnit('moment', custom), 'kN·m')
  assert.equal(quantityUnit('area', custom), 'ft²')
  assert.equal(quantityUnit('modulus', custom), 'GPa')
  assert.equal(UNIT_PRESETS.metric.groups.length, 'mm')
  assert.ok(Object.isFrozen(custom) && Object.isFrozen(custom.groups))
  assert.deepEqual(parseUnitSelection(JSON.parse(JSON.stringify(custom))), custom)
  for (const invalid of [{ ...custom, version: 2 }, { ...custom, groups: { ...custom.groups, force: 'kg' } },
    { ...custom, preset: 'metric' }, { ...custom, unexpected: true }]) assert.throws(() => parseUnitSelection(invalid))
})

test('UNITS-003: no-op edits retain exact binary64 values across all contexts, including non-invertible cases', () => {
  const selections = [UNIT_PRESETS.metric, UNIT_PRESETS.us, selectUnit(UNIT_PRESETS.metric, 'modulus', 'GPa')]
  const quantities: Quantity[] = ['length', 'barDiameter', 'area', 'inertia', 'sectionModulus', 'force', 'moment', 'stress', 'modulus', 'curvature', 'density']
  const values = [0, -0, 0.1, 15.000000000000002, -378.1234567890123, 1e-110, 1e110]
  for (const selection of selections) for (const quantity of quantities) for (const original of values) {
    const text = editableQuantity(quantity, original, selection)
    assert.ok(Object.is(commitQuantity(quantity, text, original, selection), original), `${quantity}: ${original}`)
  }
  assert.equal(commitQuantity('length', '2', 0, UNIT_PRESETS.us), 50.8)
  assert.equal(commitQuantity('force', '10', 0, UNIT_PRESETS.metric), 10000)
  assert.notEqual(formatQuantity('force', 1e-20, UNIT_PRESETS.metric), '0')
})

test('UNITS-003: invalid, incompatible, non-finite and unrepresentable input fails closed', () => {
  for (const text of ['', ' ', '0x10', 'Infinity', 'NaN', '1,000', '1e309', '1e-999', '12 mm']) assert.throws(() => parseNumericText(text))
  assert.throws(() => convertUnit('force', 1, 'mm', 'N'))
  assert.throws(() => toCanonical('force', Infinity, UNIT_PRESETS.us))
  assert.throws(() => convertUnit('length', Number.MAX_VALUE, 'm', 'mm'))
  assert.throws(() => convertUnit('length', Number.MIN_VALUE, 'mm', 'm'))
  assert.throws(() => convertUnit('curvature', 1, 'kg', 'mm⁻¹'))
  assert.throws(() => convertUnit('density', 1, 'N/m³', 'kg/m³'))
})

test('UNITS-003: compact resting text stays separate from full-precision edits and explicit rounded edits', () => {
  assert.equal(formatInputQuantity('length', 40, UNIT_PRESETS.us), '1.575')
  assert.equal(formatInputQuantity('stress', 30, UNIT_PRESETS.us), '4.351')
  assert.equal(formatInputQuantity('modulus', 200000, UNIT_PRESETS.us), '29007.5')
  assert.equal(formatInputQuantity('length', 1000000.123456, UNIT_PRESETS.metric), '1000000.123')
  assert.equal(formatInputQuantity('force', 10000, UNIT_PRESETS.metric), '10')
  for (const original of [1e-20, -1e-20]) assert.notEqual(Number(formatInputQuantity('force', original, UNIT_PRESETS.metric)), 0)
  const original = 1234567.890123456
  const compact = formatInputQuantity('force', original, UNIT_PRESETS.metric)
  const editing = editableQuantity('force', original, UNIT_PRESETS.metric)
  assert.equal(compact, '1234.568')
  assert.notEqual(compact, editing)
  assert.equal(commitQuantity('force', editing, original, UNIT_PRESETS.metric), original)
  assert.equal(commitQuantity('force', compact, original, UNIT_PRESETS.metric), 1234568)
})

test('UNITS-001/002: repeated presentation changes preserve the canonical serialized input byte for byte', () => {
  const input = JSON.parse(readFileSync('docs/examples/realistic-sections/KDS-REAL-05-complex-stress-strain.pm-project.json', 'utf8'))
  const before = JSON.stringify(input)
  const load = input.inputs.loadings.combinations[0]
  for (let cycle = 0; cycle < 50; cycle++) for (const selection of [UNIT_PRESETS.us, UNIT_PRESETS.metric]) {
    for (const [quantity, original] of [['force', load.P], ['moment', load.Mx], ['moment', load.My]] as const) {
      fromCanonical(quantity, original, selection)
      formatQuantity(quantity, original, selection)
      assert.equal(commitQuantity(quantity, editableQuantity(quantity, original, selection), original, selection), original)
    }
  }
  assert.equal(JSON.stringify(input), before)
})

test('pinned shared unit artifact matches its recorded archive and installed source hashes', () => {
  const manifest = JSON.parse(readFileSync('vendor/shared-units-artifact.json', 'utf8'))
  const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
  assert.equal(hash(readFileSync('vendor/jscad-engineering-units-1.0.0.tgz')), manifest.archiveSha256)
  for (const source of manifest.sourceFiles) assert.equal(hash(readFileSync(`node_modules/@jscad/engineering-units/${source.file}`)), source.sha256, source.file)
})
