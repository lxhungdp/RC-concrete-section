/** Exercise the same real Gridcraft host for coordinates and reinforcement; no engine commands. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import ExcelJS from 'exceljs'
const { chromium } = createRequire(import.meta.url)(process.env.PM_PLAYWRIGHT_MODULE ?? 'playwright')
const out = process.env.PM_EVIDENCE_DIR ?? 'outputs/shared-table-spreadsheet/browser'
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-unsafe-webgpu'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, acceptDownloads: true })
page.setDefaultTimeout(60_000)
const fixturePath = process.env.PM_FIXTURE ?? 'docs/examples/equivalent-block/KDS-EB-01-rectangle-8-bars.pm-project.json'
const errors = [], evidence = []
page.on('pageerror', error => errors.push(error.message))
page.on('dialog', dialog => dialog.accept())

async function snapshot() {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const iframe = document.querySelector('.pm-spreadsheet-dialog iframe'), session = new URL(iframe.src).searchParams.get('pm')
    const id = 1_000_000 + Math.floor(Math.random() * 1_000_000)
    const timer = setTimeout(() => { removeEventListener('message', listen); reject(Error('Snapshot timed out')) }, 20_000)
    function listen(event) {
      if (event.origin !== location.origin || event.source !== iframe.contentWindow || event.data?.session !== session || event.data?.id !== id) return
      clearTimeout(timer); removeEventListener('message', listen)
      event.data.ok ? resolve(event.data.data) : reject(Error(event.data.error))
    }
    addEventListener('message', listen)
    iframe.contentWindow.postMessage({ type: 'pm-gridcraft', version: 2, session, id, action: 'values' }, location.origin)
  }))
}
async function open(title) {
  await page.getByRole('button', { name: 'Open XLSX', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: title, exact: true })
  await page.waitForFunction(() => document.querySelector('.pm-spreadsheet-dialog iframe')?.dataset.presented === 'true')
  const rect = await dialog.boundingBox(); assert.equal(rect.width, 600); assert.equal(rect.height, 500)
  return dialog
}
async function close(dialog, title) { await dialog.getByRole('button', { name: `Close ${title}`, exact: true }).click(); await dialog.waitFor({ state: 'detached' }) }
async function update(dialog) {
  await dialog.getByRole('button', { name: 'Update', exact: true }).click()
  await dialog.getByRole('status').filter({ hasText: 'Updated.' }).waitFor()
  await page.waitForFunction(() => document.querySelector('.pm-spreadsheet-dialog .ws-action--primary')?.disabled === false)
}
async function pasteFirstRow(text) {
  const canvas = page.frameLocator('.pm-spreadsheet-dialog iframe').locator('canvas')
  await canvas.click({ position: { x: 80, y: 43 } })
  await canvas.evaluate((node, text) => {
    const data = new DataTransfer(); data.setData('text/plain', text)
    node.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  }, text)
  return snapshot()
}
async function project() {
  await page.getByRole('button', { name: 'Project menu', exact: true }).click()
  await page.getByLabel('Project file format').selectOption('json')
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export project to JSON', exact: true }).click()
  const file = `${out}/project-${Date.now()}.json`; await (await pending).saveAs(file)
  return JSON.parse(await readFile(file, 'utf8'))
}
async function save(dialog, name, sheet, formulaAddress) {
  await page.evaluate(() => Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined }))
  const pending = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Save as…', exact: true }).click()
  const file = `${out}/${name}.xlsx`; await (await pending).saveAs(file)
  const book = new ExcelJS.Workbook(); await book.xlsx.load(new Uint8Array(await readFile(file)).buffer)
  const table = book.getWorksheet(sheet)
  if (formulaAddress) assert.equal(typeof table.getCell(formulaAddress).formula, 'string')
  assert.equal(table.getCell('B1').protection?.locked ?? true, true)
  assert.equal(table.getCell('B2').protection.locked, false)
  return file
}

try {
  await page.goto(process.env.PM_TEST_URL ?? 'http://127.0.0.1:3017', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Project menu', exact: true }).click()
  await page.getByLabel('Project file format').selectOption('json')
  const choose = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Import project from JSON', exact: true }).click()
  await (await choose).setFiles(fixturePath)
  await page.locator('.pm-boundary-row').first().waitFor()
  const before = (await project()).inputs
  await page.getByRole('tab', { name: 'Point', exact: true }).click()
  let dialog = await open('Coordinates')
  assert.equal(await dialog.getByRole('button', { name: 'Update', exact: true }).isDisabled(), true, 'Applied concrete stays locked')
  const original = await snapshot(); assert.equal(original.rows[0].length, 3)
  await page.screenshot({ path: `${out}/coordinates-light.png` })
  await save(dialog, 'locked-coordinates', 'Coordinates')
  await close(dialog, 'Coordinates')
  await page.locator('.pm-boundary-row.is-active').getByTitle('Lock', { exact: true }).click()
  dialog = await open('Coordinates')
  const x = original.rows[1][1].value, y = original.rows[1][2].value
  const minX = Math.min(...original.rows.slice(1).map(row => row[1].value)), changedX = x + (x === minX ? -10 : 10)
  let edited = await pasteFirstRow(`=${x}${x === minX ? '-10' : '+10'}\t${y}`)
  assert.equal(edited.rows[1][1].value, changedX)
  await update(dialog); await update(dialog) // A successful commit advances the target identity.
  await save(dialog, 'coordinates-formula', 'Coordinates', 'B2')
  const invalid = await pasteFirstRow('=1/0')
  assert.equal(typeof invalid.rows[1][1].value.error, 'string')
  await dialog.getByRole('button', { name: 'Update', exact: true }).click()
  await dialog.getByRole('alert').filter({ hasText: 'B2:' }).waitFor()
  await close(dialog, 'Coordinates')
  assert.deepEqual((await project()).inputs.geometry, before.geometry, 'Coordinate Update changes draft only')
  await page.locator('.pm-boundary-row.is-active').getByRole('button', { name: 'Apply', exact: true }).click()
  const applied = (await project()).inputs
  assert.equal(applied.geometry.outers[0].points[0].x, changedX)
  assert.deepEqual(applied.geometry.rebars, before.geometry.rebars)
  dialog = await open('Coordinates')
  const reopened = await snapshot(); assert.equal(reopened.rows[1][1].value, changedX); assert.equal(reopened.rows[1][1].formula, false)
  await close(dialog, 'Coordinates')

  const hole = page.getByRole('button', { name: 'Hole 1', exact: true }).first()
  if (await hole.count()) {
    await hole.click(); dialog = await open('Coordinates')
    const rows = (await snapshot()).rows
    assert.equal(rows.length, applied.geometry.outers[0].holes[0].points.length + 1)
    assert.equal(rows[1][0].value, applied.geometry.outers[0].holes[0].points[0].id)
    await page.screenshot({ path: `${out}/hole.png` }); await close(dialog, 'Coordinates')
  }
  await page.getByRole('tab', { name: 'Rebar', exact: true }).click()
  await page.getByRole('heading', { name: /Rebar list/ }).waitFor()
  dialog = await open('Rebars')
  const initialBars = await snapshot(); assert.equal(initialBars.rows[0].length, 6)
  await update(dialog); await update(dialog)
  await close(dialog, 'Rebars')
  assert.deepEqual((await project()).inputs.geometry, applied.geometry, 'Rebar no-op preserves exact values, IDs and sources')
  dialog = await open('Rebars')
  const dia = initialBars.rows[1][1].value, area = initialBars.rows[1][2].value, material = initialBars.rows[1][3].value
  edited = await pasteFirstRow(`=${dia}+1\t${area}\t${material}`)
  assert.equal(edited.rows[1][1].value, dia + 1); assert.equal(edited.rows[1][2].value, area)
  await update(dialog); await update(dialog)
  const saved = await save(dialog, 'rebars-formula', 'Rebars', 'B2')
  await page.screenshot({ path: `${out}/rebars-light.png` })
  await page.evaluate(() => { document.body.dataset.jscadTheme = 'dark' })
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.pm-spreadsheet-dialog')).colorScheme === 'dark')
  await page.screenshot({ path: `${out}/rebars-dark.png` })
  await page.setViewportSize({ width: 390, height: 900 })
  const narrow = await dialog.boundingBox(); assert.ok(narrow.x >= 0 && narrow.x + narrow.width <= 391)
  assert.ok(await dialog.locator('h2').evaluate(node => node.scrollWidth <= node.clientWidth))
  await page.screenshot({ path: `${out}/rebars-narrow.png` })
  await page.setViewportSize({ width: 1600, height: 1100 })
  await close(dialog, 'Rebars')
  const final = (await project()).inputs
  assert.equal(final.geometry.rebars[0].dia, dia + 1); assert.equal(final.geometry.rebars[0].area, applied.geometry.rebars[0].area)
  assert.deepEqual(final.geometry.rebars[0].areaSource, { type: 'manual' })
  assert.deepEqual(final.geometry.outers, applied.geometry.outers)
  dialog = await open('Rebars')
  const values = await snapshot(); assert.equal(values.rows[1][1].formula, false); assert.equal(values.rows[1][1].value, dia + 1)
  const chooser = page.waitForEvent('filechooser'); await dialog.getByRole('button', { name: 'Open file', exact: true }).click()
  await (await chooser).setFiles(saved)
  await page.waitForFunction(() => !document.querySelector('.pm-spreadsheet-dialog .ws-action--primary').disabled)
  assert.equal((await snapshot()).rows[1][1].formula, true)
  await update(dialog); await close(dialog, 'Rebars')
  assert.deepEqual((await project()).inputs.geometry, final.geometry, 'Opening saved XLSX and updating preserves values')
  // A project replacement during the session invalidates its captured target, even with matching IDs.
  dialog = await open('Rebars')
  const firstBar = page.locator(`input[aria-label^="Bar ${final.geometry.rebars[0].id} diameter"]`)
  const previousText = await firstBar.inputValue()
  await page.locator('input[accept="application/json,.json"]').setInputFiles(fixturePath)
  await page.waitForFunction(({ id, text }) => document.querySelector(`input[aria-label^="Bar ${id} diameter"]`)?.value !== text,
    { id: final.geometry.rebars[0].id, text: previousText })
  await dialog.getByRole('button', { name: 'Update', exact: true }).click()
  await dialog.getByRole('alert').filter({ hasText: 'The table changed' }).waitFor()
  await close(dialog, 'Rebars')
  assert.deepEqual((await project()).inputs.geometry, before.geometry)
  dialog = await open('Rebars'); await pasteFirstRow('=16+2'); await close(dialog, 'Rebars')
  assert.deepEqual((await project()).inputs.geometry, before.geometry, 'Closing discards the independent workbook draft')
  await page.getByRole('tab', { name: 'Concrete', exact: true }).click()
  await page.getByRole('tab', { name: 'Point', exact: true }).click()
  dialog = await open('Coordinates')
  await page.screenshot({ path: `${out}/coordinates-dark.png` })
  await page.setViewportSize({ width: 390, height: 900 })
  await page.screenshot({ path: `${out}/coordinates-narrow.png` })
  const pointNarrow = await dialog.boundingBox(); assert.ok(pointNarrow.x >= 0 && pointNarrow.x + pointNarrow.width <= 391)
  await close(dialog, 'Coordinates')
  evidence.push({ fixturePath, coordinateColumns: 3, rebarColumns: 6, lockedGuard: true, draftApply: true,
    formulaSave: true, exactNoop: true, independentAs: true, repeatedUpdate: true, reopenedAsValues: true, staleTarget: true, cancel: true, narrow, pointNarrow })
  assert.deepEqual(errors, [])
  await writeFile(`${out}/evidence.json`, JSON.stringify({ evidence, errors }, null, 2))
  console.log('PASS: shared Coordinates/Rebars modal, values-only Update, exact no-op, draft Apply and independent As')
} finally {
  await page.screenshot({ path: `${out}/final.png` }).catch(() => {})
  await writeFile(`${out}/errors.json`, JSON.stringify(errors))
  await browser.close()
}
