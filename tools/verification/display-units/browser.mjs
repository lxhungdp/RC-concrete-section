/** Browser acceptance evidence. Supply PM_PLAYWRIGHT_MODULE from an installed test runtime. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PM_PLAYWRIGHT_MODULE ?? 'playwright')
const out = process.env.PM_EVIDENCE_DIR ?? 'outputs/units'
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: process.env.PM_BROWSER_CHANNEL ?? 'msedge', headless: true })
const evidence = []
const cases = [
  ['stress-strain', 'docs/examples/realistic-sections/KDS-REAL-05-complex-stress-strain.pm-project.json'],
  ['equivalent-block', 'docs/examples/equivalent-block/ACI-EB-01-rectangle-8-bars.pm-project.json']
]
const digest = text => createHash('sha256').update(text).digest('hex')
const rowLayouts = []
const checkUnitRows = async page => {
  const layout = await page.locator('.pm-unit-field').evaluateAll(rows => rows.map(row => {
    const label = row.querySelector('span')
    const select = row.querySelector('select')
    const text = label.getBoundingClientRect()
    const field = select.getBoundingClientRect()
    const bounds = row.getBoundingClientRect()
    const style = getComputedStyle(select)
    const context = document.createElement('canvas').getContext('2d')
    context.font = style.font
    const widestValue = Math.max(...[...select.options].map(option => context.measureText(option.textContent).width))
    return { label: label.textContent, labelY: text.y + text.height / 2, fieldY: field.y + field.height / 2,
      labelRight: text.right, fieldLeft: field.left, fieldRight: field.right, rowRight: bounds.right,
      rowHeight: bounds.height, fieldHeight: field.height, fieldWidth: field.width,
      requiredWidth: widestValue + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) +
        parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth) }
  }))
  assert.equal(layout.length, 5)
  for (const row of layout) {
    assert.ok(Math.abs(row.labelY - row.fieldY) < 1, `${row.label}: label and field share a row`)
    assert.ok(row.labelRight <= row.fieldLeft, `${row.label}: label does not overlap field`)
    assert.ok(row.fieldRight <= row.rowRight + 1, `${row.label}: field remains inside sidebar`)
    assert.ok(Math.abs(row.fieldLeft - layout[0].fieldLeft) < 1, `${row.label}: fields align in one column`)
    assert.ok(row.rowHeight <= row.fieldHeight + 1, `${row.label}: one control-height row`)
    assert.ok(row.fieldWidth + 1 >= row.requiredWidth, `${row.label}: longest unit remains readable: ${JSON.stringify(row)}`)
  }
  rowLayouts.push({ viewport: page.viewportSize(), layout })
}
try {
  const preferences = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await preferences.goto(process.env.PM_TEST_URL ?? 'http://127.0.0.1:3001', { waitUntil: 'networkidle' })
  const openUnits = async () => {
    await preferences.getByRole('button', { name: 'Options', exact: true }).click()
    await preferences.getByRole('tab', { name: 'Units', exact: true }).click()
  }
  await openUnits()
  assert.equal(await preferences.getByLabel('Display unit preset').count(), 0)
  const quick = preferences.getByRole('group', { name: 'Quick unit selection' })
  assert.deepEqual(await quick.getByRole('button').allTextContents(), ['Metric', 'US'])
  assert.equal(await quick.locator('[aria-pressed], [aria-selected]').count(), 0)
  const fields = ['Coordinates & dimensions', 'Force', 'Moment', 'Stress & modulus', 'Mass density']
  assert.deepEqual(await preferences.locator('.pm-panel-section select').evaluateAll(elements => elements.map(el => el.getAttribute('aria-label'))), fields)
  await checkUnitRows(preferences)
  await quick.getByRole('button', { name: 'US', exact: true }).click()
  await preferences.getByLabel('Coordinates & dimensions').selectOption('ft')
  await preferences.getByLabel('Stress & modulus').selectOption('GPa')
  await preferences.waitForFunction(() => {
    const raw = JSON.parse(localStorage.getItem('pm-column.display-units.v2') ?? 'null')
    return raw?.version === 2 && !('preset' in raw) && Object.keys(raw).length === 2 &&
      Object.keys(raw.groups).length === 5 && raw.groups.length === 'ft' && raw.groups.stress === 'GPa'
  })
  await preferences.reload({ waitUntil: 'networkidle' })
  await openUnits()
  assert.equal(await preferences.getByLabel('Coordinates & dimensions').inputValue(), 'ft')
  assert.equal(await preferences.getByLabel('Stress & modulus').inputValue(), 'GPa')
  assert.equal(await preferences.getByLabel('Force', { exact: true }).inputValue(), 'kip')
  await preferences.getByRole('button', { name: 'Metric', exact: true }).click()
  assert.deepEqual(await Promise.all(fields.map(label => preferences.getByLabel(label, { exact: true }).inputValue())),
    ['mm', 'kN', 'kN·m', 'MPa', 'kg/m³'])
  const resize = preferences.getByRole('separator', { name: 'Resize side panel' })
  await resize.focus()
  await resize.press('Home')
  await quick.getByRole('button', { name: 'US', exact: true }).focus()
  await preferences.keyboard.press('Enter')
  assert.deepEqual(await Promise.all(fields.map(label => preferences.getByLabel(label, { exact: true }).inputValue())),
    ['in', 'kip', 'kip·ft', 'ksi', 'lbm/ft³'])
  await checkUnitRows(preferences)
  await preferences.screenshot({ path: `${out}/unit-controls-minimum-width.png` })
  await preferences.close()
  for (const [name, file] of cases) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('dialog', dialog => dialog.accept())
    await page.addInitScript(() => {
      window.__unitAudit = { sent: [], surfaces: [] }
      const NativeWorker = window.Worker
      window.Worker = class extends NativeWorker {
        constructor(...args) {
          super(...args)
          this.addEventListener('message', event => {
            if (event.data.type === 'success' && event.data.requestType === 'buildSurface') window.__unitAudit.surfaces.push(JSON.stringify(event.data.result))
          })
        }
        postMessage(message, ...rest) {
          window.__unitAudit.sent.push({ type: message.type, payload: JSON.stringify(message.payload) })
          return super.postMessage(message, ...rest)
        }
      }
    })
    await page.goto(process.env.PM_TEST_URL ?? 'http://127.0.0.1:3001', { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Project menu' }).click()
    await page.getByLabel('Project file format').waitFor()
    await page.getByLabel('Project file format').selectOption('json')
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Import project from JSON' }).click()
    await (await chooser).setFiles(file)
    await page.waitForFunction(() => window.__unitAudit.surfaces.length > 0, null, { timeout: 60000 })
    const exportInputs = async () => {
      await page.getByRole('button', { name: 'Project menu' }).click()
      await page.getByLabel('Project file format').selectOption('json')
      const downloaded = page.waitForEvent('download')
      await page.getByRole('button', { name: 'Export project to JSON' }).click()
      const download = await downloaded
      return JSON.parse(await readFile(await download.path(), 'utf8')).inputs
    }
    // The import parser applies documented defaults/version normalization before any unit change.
    const canonicalInputs = await exportInputs()
    await page.getByRole('button', { name: 'Options', exact: true }).click()
    await page.getByRole('tab', { name: 'Units', exact: true }).click()
    await page.waitForTimeout(1500)
    const baseline = await page.evaluate(() => structuredClone(window.__unitAudit))
    assert.ok(baseline.surfaces.length)
    for (const preset of ['us', 'metric', 'us']) await page.getByRole('button', { name: preset === 'us' ? 'US' : 'Metric', exact: true }).click()
    await page.getByLabel('Coordinates & dimensions').selectOption('cm')
    await page.getByLabel('Stress & modulus', { exact: true }).selectOption('GPa')
    await page.getByLabel('Stress & modulus', { exact: true }).selectOption('ksi')
    await page.waitForTimeout(500)
    assert.deepEqual(await page.evaluate(() => window.__unitAudit), baseline, 'unit-only changes must not submit any worker job or modify surface responses')
    await checkUnitRows(page)
    await page.screenshot({ path: `${out}/${name}-units-light.png` })
    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await checkUnitRows(page)
    await page.screenshot({ path: `${out}/${name}-units-dark.png` })
    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await page.getByRole('button', { name: 'Materials', exact: true }).click()
    const fc = page.getByRole('textbox', { name: /^fc \(/ })
    const displayedFc = await fc.inputValue()
    assert.equal(displayedFc, name === 'stress-strain' ? '4.351' : '5.802')
    await fc.focus()
    const editingFc = await fc.inputValue()
    assert.notEqual(editingFc, displayedFc, 'focus must reveal the full-precision editing value')
    await fc.press('Enter')
    assert.equal(await fc.inputValue(), displayedFc, 'blur must restore compact presentation text')
    await fc.focus()
    await fc.press('Tab')
    await page.getByRole('button', { name: 'Materials', exact: true }).click()
    await page.waitForTimeout(350)
    assert.deepEqual(await page.evaluate(() => window.__unitAudit), baseline, 'no-op material edit must retain the exact canonical input and result')
    await page.screenshot({ path: `${out}/${name}-materials-light.png` })
    await page.getByRole('button', { name: 'Demand Check', exact: true }).click()
    await page.getByRole('textbox', { name: /Loadcase .* Pu/ }).first().waitFor()
    const demandBaseline = await page.evaluate(() => structuredClone(window.__unitAudit))
    const pu = page.getByRole('textbox', { name: /Loadcase .* Pu/ }).first()
    const compactPu = await pu.inputValue()
    await pu.focus()
    const editingPu = await pu.inputValue()
    assert.notEqual(editingPu, compactPu)
    await pu.press('Enter')
    assert.equal(await pu.inputValue(), compactPu)
    await pu.fill('123.456')
    await pu.press('Escape')
    assert.equal(await pu.inputValue(), compactPu, 'Escape restores compact text without committing a draft')
    await page.waitForTimeout(500)
    // Entering the demand workspace may start its diagnostic field jobs; a no-op input itself
    // must never submit a new surface, demand batch or inverse calculation.
    const critical = audit => audit.sent.filter(job => ['buildSurface', 'checkLoadcase', 'checkLoadcases'].includes(job.type))
    assert.deepEqual(critical(await page.evaluate(() => window.__unitAudit)), critical(demandBaseline))
    await page.screenshot({ path: `${out}/${name}-demand-light.png` })
    const demandTable = page.getByRole('table', { name: 'Loadcase demand table' })
    const detailCase = canonicalInputs.loadings.combinations.at(-1)
    const detailRow = demandTable.getByRole('row').filter({ has: page.getByLabel(`Loadcase ${detailCase.id} name`, { exact: true }) })
    await detailRow.press('Enter')
    assert.equal(await detailRow.getAttribute('aria-current'), 'true')
    assert.equal(await demandTable.getByRole('columnheader').count(), 6)
    await page.getByRole('button', { name: 'Detail calculation', exact: true }).click()
    assert.equal(await page.getByLabel('Calculation trace loadcase', { exact: true }).inputValue(), String(detailCase.id))
    const traceUnits = page.locator('.pm-calculation-document__meta').getByText('kip · kip·ft · cm · ksi', { exact: true })
    await traceUnits.waitFor()
    await page.screenshot({ path: `${out}/${name}-trace-light.png` })
    await page.getByRole('button', { name: 'Close loadcase calculation details', exact: true }).click()
    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await page.screenshot({ path: `${out}/${name}-demand-dark.png` })
    const modules = page.getByRole('navigation', { name: 'Design modules' })
    assert.deepEqual(await modules.getByRole('button').allTextContents(),
      ['Section', 'Materials', 'Capacity', 'Demand Check', 'Report', 'Options'])
    assert.equal(await page.getByLabel('Loadcases included in report').count(), 0)
    await modules.getByRole('button', { name: 'Report', exact: true }).click()
    const report = page.getByRole('complementary', { name: 'Report workspace editor' })
    await report.getByRole('button', { name: 'All', exact: true }).click()
    const pdfDownload = page.waitForEvent('download', { timeout: 60000 })
    await report.getByRole('button', { name: 'PDF', exact: true }).click()
    await (await pdfDownload).saveAs(`${out}/${name}-custom-units.pdf`)
    await page.getByRole('button', { name: 'Options', exact: true }).click()
    await page.getByRole('tab', { name: 'Units', exact: true }).click()
    await page.getByRole('button', { name: 'Metric', exact: true }).click()
    // Native canonical JSON remains the oracle, including nonzero signed biaxial actions.
    const exported = await exportInputs()
    assert.deepEqual(exported, canonicalInputs, 'native input snapshot must be unchanged after unit cycles and no-op edits')
    const final = await page.evaluate(() => structuredClone(window.__unitAudit))
    assert.deepEqual(final.surfaces, baseline.surfaces)
    assert.deepEqual(errors, [])
    await page.setViewportSize({ width: 540, height: 850 })
    await page.getByRole('button', { name: 'Options', exact: true }).click()
    await page.getByRole('tab', { name: 'Units', exact: true }).click()
    await checkUnitRows(page)
    await page.screenshot({ path: `${out}/${name}-units-narrow.png` })
    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await checkUnitRows(page)
    await page.screenshot({ path: `${out}/${name}-units-narrow-light.png` })
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.getByRole('button', { name: 'US', exact: true }).click()
    await page.getByRole('button', { name: 'Demand Check', exact: true }).click()
    const editedPu = page.getByRole('textbox', { name: /Loadcase .* Pu/ }).first()
    const authoredRoundedText = await editedPu.inputValue()
    await editedPu.focus()
    await editedPu.fill(authoredRoundedText)
    assert.equal(await editedPu.inputValue(), authoredRoundedText, 'the authored edit must reach the focused draft')
    await editedPu.press('Enter')
    const roundedEdit = await exportInputs()
    const roundedCanonical = Number(authoredRoundedText) * 4448.2216152605
    assert.ok(Math.abs(roundedEdit.loadings.combinations[0].P - roundedCanonical) <= 4 * Number.EPSILON * Math.abs(roundedCanonical),
      JSON.stringify({ authoredRoundedText, actual: roundedEdit.loadings.combinations[0].P, expected: roundedCanonical }))
    assert.notEqual(roundedEdit.loadings.combinations[0].P, canonicalInputs.loadings.combinations[0].P,
      'explicitly typing rounded text is an authored edit, not a no-op')
    await editedPu.fill('100')
    await editedPu.press('Enter')
    await page.waitForTimeout(700)
    const authored = await exportInputs()
    const expectedAuthored = structuredClone(canonicalInputs)
    // Independent NIST exact anchor: 100 kip = 444822.16152605 N.
    const actualForce = authored.loadings.combinations[0].P
    // Source-scale ratio plus multiplication are bounded by four binary64 rounding units.
    // Only this authored conversion receives the bound; every unchanged input stays exact.
    assert.ok(Math.abs(actualForce - 444822.16152605) <= 4 * Number.EPSILON * 444822.16152605)
    expectedAuthored.loadings.combinations[0].P = actualForce
    assert.deepEqual(authored, expectedAuthored, 'a real edit converts once and changes only the authored canonical field')
    await editedPu.fill('')
    await editedPu.press('Enter')
    assert.equal(await editedPu.getAttribute('aria-invalid'), 'true')
    assert.deepEqual(await exportInputs(), expectedAuthored, 'blank input must not be committed as zero')
    assert.deepEqual(await page.evaluate(() => window.__unitAudit.surfaces), baseline.surfaces, 'a demand edit must reuse the resistance surface')
    evidence.push({ name, canonicalInputsSha256: digest(JSON.stringify(exported)),
      surfaceSha256: baseline.surfaces.map(digest), unitSwitchWorkerJobs: 0, compactFc: displayedFc, editingFc,
      compactPu, editingPu, noOpAndCancelPreserved: true, explicitRoundedEditCommitted: true,
      authoredKipInput: '100', authoredCanonicalForceN: authored.loadings.combinations[0].P, invalidBlankRetained: true, consoleErrors: errors })
    await page.close()
  }
  await writeFile(`${out}/browser-evidence.json`, JSON.stringify(evidence, null, 2))
  await writeFile(`${out}/row-layout-evidence.json`, JSON.stringify(rowLayouts, null, 2))
  console.log(JSON.stringify(evidence, null, 2))
} finally { await browser.close() }
