/** Single native title row, modeless controls/file flows and evaluated-only project Update. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import ExcelJS from 'exceljs'
const { chromium } = createRequire(import.meta.url)(process.env.PM_PLAYWRIGHT_MODULE ?? 'playwright')
const out = process.env.PM_EVIDENCE_DIR ?? 'outputs/native-project-window/browser'
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-unsafe-webgpu'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, acceptDownloads: true })
page.setDefaultTimeout(60_000)
const errors = [], evidence = {}, sheets = ['Project', 'Section', 'Rebar', 'Material', 'Loadings', 'Load reference', 'Options', 'Resistance', 'Units']
const projectTrigger = page.getByRole('button', { name: 'Project menu', exact: true })
const projectMenu = page.getByRole('dialog', { name: 'Project information and files', exact: true })
const projectOpen = projectMenu.getByRole('button', { name: 'Open', exact: true })
let editor
page.on('pageerror', error => errors.push(error.message))
page.context().on('page', child => { child.on('pageerror', error => errors.push(error.message)) })
await page.context().addInitScript(() => {
  window.__pmEvents = []
  addEventListener('message', event => {
    if (event.data?.type !== 'pm-gridcraft') return
    if (event.data.event === 'ready') window.__pmNativeWindow = event.source
    window.__pmEvents.push({ at: Date.now(), type: event.data.event ?? event.data.action, id: event.data.id, ok: event.data.ok })
  })
})
const rows = (data, sheet) => data.sheets.find(item => item.name === sheet).rows
const fieldRow = (data, sheet, label) => { const row = rows(data, sheet).findIndex(cells => cells[0]?.value === label); assert.ok(row >= 0, `${sheet}: ${label}`); return row }
const cellAddress = (row, column) => `${String.fromCharCode(65 + column)}${row + 1}`
async function snapshot() {
  const session = new URL(editor.url()).searchParams.get('pm')
  return page.evaluate(session => new Promise((resolve, reject) => {
    const child = window.__pmNativeWindow, id = 1_000_000 + Math.floor(Math.random() * 1_000_000)
    const timer = setTimeout(() => { removeEventListener('message', listen); reject(Error('Snapshot timed out')) }, 20_000)
    function listen(event) {
      if (event.source !== child || event.origin !== location.origin || event.data?.session !== session || event.data?.id !== id) return
      clearTimeout(timer); removeEventListener('message', listen)
      event.data.ok ? resolve(event.data.data) : reject(Error(event.data.error))
    }
    addEventListener('message', listen)
    child.postMessage({ type: 'pm-gridcraft', version: 4, session, id, action: 'values' }, location.origin)
  }), session)
}
async function openFromProjectMenu() {
  await projectTrigger.click()
  await projectOpen.click()
}
async function open() {
  await openFromProjectMenu()
  await page.waitForFunction(() => document.querySelector('iframe[title="Project Excel"]')?.dataset.presented === 'true')
  editor = await page.locator('iframe[title="Project Excel"]').elementHandle().then(node => node.contentFrame())
  assert.ok(editor)
  assert.deepEqual(page.context().pages().map(item => item.url()).filter(url => /^https?:/u.test(url)), [page.url()], 'Excel has no separate browser window/address bar')
  assert.equal(await page.locator('.pm-spreadsheet-dialog').count(), 0)
  assert.equal(await page.locator('.pm-app-window').evaluate(node => node.matches(':modal')), false)
  const labels = await page.locator('.pm-app-window > header > button').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label') ?? node.textContent))
  assert.deepEqual(labels, ['Update to Project', 'Minimize Excel', 'Maximize Excel', 'Close Excel'])
  const update = page.getByRole('button', { name: 'Update to Project', exact: true })
  assert.equal(await update.evaluate(node => node.classList.contains('ws-action--primary')), true)
  assert.equal(await editor.locator('button').count(), 0, 'No Update button is inserted into Gridcraft itself')
  const app = await page.locator('.pm-app-window').boundingBox(), frame = await page.locator('iframe[title="Project Excel"]').boundingBox()
  const header = await page.locator('.pm-app-window > header').boundingBox(), action = await update.boundingBox()
  assert.ok(Math.abs(frame.y - app.y) <= 2, 'The canvas starts at the window top; no extra toolbar row consumes height')
  assert.ok(Math.abs(header.y - frame.y) <= 1 && header.height === 38)
  assert.ok(action.y >= frame.y && action.y + action.height <= frame.y + 38, 'Update shares the native filename row')
  assert.ok(action.x > frame.x + frame.width / 2)
  return editor
}
async function close() { await page.getByRole('button', { name: 'Close Excel', exact: true }).click(); await page.locator('.pm-app-window').waitFor({ state: 'detached' }) }
async function screenshot(name) { await page.locator('.pm-app-window').screenshot({ path: `${out}/${name}.png` }) }
async function ready(message) {
  await editor.waitForFunction(message => document.documentElement.dataset.pmBusy === 'false' &&
    (!message || document.getElementById('pm_project_status')?.textContent === message || document.documentElement.dataset.pmFailed === 'true'), message)
  await page.getByRole('button', { name: 'Update to Project', exact: true }).waitFor({ state: 'visible' })
  await page.waitForFunction(() => !document.querySelector('.pm-app-window .ws-action--primary')?.disabled)
  if (message) assert.equal(await editor.locator('#pm_project_status').textContent(), message)
}
async function go(sheet, address) {
  const canvas = editor.locator('canvas')
  // The original native Name Box accepts sheet-qualified references, including frozen rows.
  await canvas.click({ position: { x: 50, y: 178 } }); await snapshot()
  await page.keyboard.press('Control+a')
  await page.keyboard.type(`'${sheet.replaceAll("'", "''")}'!${address}`, { delay: 20 })
  await page.keyboard.press('Enter'); await snapshot()
}
async function paste(sheet, row, column, text) {
  await go(sheet, cellAddress(row, column))
  await editor.locator('canvas').evaluate((node, text) => {
    const data = new DataTransfer(); data.setData('text/plain', text)
    node.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  }, text)
  return snapshot()
}
async function field(sheet, label, text) { return paste(sheet, fieldRow(await snapshot(), sheet, label), 1, text) }
async function update(expect = 'Updated.') {
  await page.getByRole('button', { name: 'Update to Project', exact: true }).click()
  await ready(expect)
}
async function save(name, keyboard = false) {
  await page.evaluate(() => Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined }))
  const pending = page.waitForEvent('download')
  if (keyboard) { await editor.locator('canvas').focus(); await page.keyboard.press('Control+s') }
  else await editor.locator('canvas').click({ position: { x: 53, y: 18 } }) // Native Save, immediately after Open.
  const file = `${out}/${name}.xlsx`; await (await pending).saveAs(file); await ready('Saved.')
  const book = new ExcelJS.Workbook(); await book.xlsx.load(new Uint8Array(await readFile(file)).buffer)
  return { file, book }
}
async function openFile(file, keyboard = false) {
  const pending = page.waitForEvent('filechooser')
  if (keyboard) { await editor.locator('canvas').focus(); await page.keyboard.press('Control+o') }
  else await editor.locator('canvas').click({ position: { x: 21, y: 18 } })
  await (await pending).setFiles(file); await ready()
  assert.equal(await editor.evaluate(() => document.documentElement.dataset.pmFailed), 'false', await editor.locator('#pm_project_status').textContent())
}
async function project() {
  const restore = await page.locator('.pm-app-window[data-window-state="normal"], .pm-app-window[data-window-state="maximized"]').count()
  if (restore) await page.getByRole('button', { name: 'Minimize Excel', exact: true }).click()
  await page.getByRole('button', { name: 'Project menu', exact: true }).click()
  await page.getByLabel('Project file format').selectOption('json')
  const pending = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export project to JSON', exact: true }).click()
  const file = `${out}/project-${Date.now()}.json`; await (await pending).saveAs(file)
  if (restore) await openFromProjectMenu()
  return JSON.parse(await readFile(file, 'utf8'))
}
async function importProject(file) {
  await page.getByRole('button', { name: 'Project menu', exact: true }).click()
  await page.getByLabel('Project file format').selectOption('json')
  const pending = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'Import project from JSON', exact: true }).click()
  await (await pending).setFiles(file); await page.locator('.pm-boundary-row').first().waitFor()
}
try {
  await page.goto(process.env.PM_TEST_URL ?? 'http://127.0.0.1:3001', { waitUntil: 'networkidle' })
  assert.equal(await page.locator('.pm-toolbar > button[aria-label="Excel"]').count(), 0)
  await projectTrigger.click()
  await projectMenu.getByText('Import / Export / Open', { exact: true }).waitFor()
  const fileActions = projectMenu.locator('.pm-project-menu__actions > button')
  assert.deepEqual((await fileActions.allTextContents()).map(label => label.trim()), ['Import', 'Export', 'Open'])
  const actionTops = await fileActions.evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().top))
  assert.equal(new Set(actionTops).size, 1)
  assert.equal(await projectOpen.locator('svg, img').count(), 0)
  await projectMenu.screenshot({ path: `${out}/project-menu.png` })
  await projectOpen.click()
  await close(); evidence.closedDuringStartup = true
  assert.ok(await projectTrigger.evaluate(button => button === document.activeElement))
  evidence.projectMenuOpen = true
  await importProject('docs/examples/realistic-sections/KDS-REAL-05-complex-stress-strain.pm-project.json')
  const before = await project(), started = Date.now(); await open(); evidence.openedMs = Date.now() - started
  assert.deepEqual((await snapshot()).sheets.map(sheet => sheet.name), sheets)
  console.log('Native window auto-loaded all project sheets')
  await screenshot('native-light')
  const initial = await snapshot(), fckRow = fieldRow(initial, 'Material', 'fck (MPa)')
  await go('Material', cellAddress(fckRow, 1))
  await page.keyboard.type('=SUM(20,20)'); await page.keyboard.press('Enter')
  assert.equal(rows(await snapshot(), 'Material')[fckRow][1].value, 40, 'Fast native cell entry retains every character')
  await editor.locator('canvas').click({ position: { x: 85, y: 18 } })
  assert.deepEqual(rows(await snapshot(), 'Material')[fckRow][1], rows(initial, 'Material')[fckRow][1], 'Native title-row Undo restores the prior literal input')
  await editor.locator('canvas').click({ position: { x: 117, y: 18 } })
  assert.equal(rows(await snapshot(), 'Material')[fckRow][1].value, 40, 'Native title-row Redo restores the formula result')
  assert.equal(rows(await snapshot(), 'Material')[fckRow][1].formula, true)
  await field('Project', 'Client', 'Native workbook client')
  const source = await snapshot(), firstVertex = fieldRow(source, 'Section', 'Outer') + 2
  await paste('Section', firstVertex, 0, '=-560')
  await field('Options', 'Divisions', '=48')
  const count = page.context().pages().length
  await openFromProjectMenu(); assert.equal(page.context().pages().length, count, 'Project Open focuses the existing native draft')
  assert.equal(rows(await snapshot(), 'Material')[fckRow][1].formula, true)
  const saved = await save('native-formula-project')
  console.log('Native formula entry and Quick Access Save passed')
  assert.equal(saved.book.getWorksheet('Material').getCell(fckRow + 1, 2).formula, 'SUM(20,20)')
  const independent = await project(); assert.deepEqual(independent.inputs, before.inputs); assert.deepEqual(independent.meta.information, before.meta.information)
  await update(); await update()
  const applied = await project()
  assert.equal(applied.inputs.materials.concrete.fck, 40); assert.equal(applied.inputs.analysis.mesh.sizing.seedDivisions, 48)
  assert.equal(applied.inputs.geometry.outers[0].points[0].x, -560); assert.equal(applied.meta.information.client, 'Native workbook client')
  console.log('Native repeated Update applied complete evaluated values')
  await screenshot('updated')
  await close(); await open()
  assert.ok((await snapshot()).sheets.every(sheet => sheet.rows.every(row => row.every(cell => !cell.formula))), 'P-M stores values only')
  // Native Open recalculates stale caches and keeps explicit user formatting/helper worksheets.
  saved.book.getWorksheet('Material').getCell(fckRow + 1, 2).value = { formula: 'SUM(21,20)', result: -999 }
  saved.book.getWorksheet('Project').getCell('A1').font = { bold: true }
  const helper = saved.book.addWorksheet('Calculations')
  helper.getCell('A1').value = 1; helper.getCell('A2').value = 2; helper.getCell('A3').value = 3
  helper.getCell('B1').value = { formula: 'A1*2', result: -999 }
  const sourceFile = `${out}/native-open-source.xlsx`; await writeFile(sourceFile, new Uint8Array(await saved.book.xlsx.writeBuffer()))
  await openFile(sourceFile)
  assert.equal(rows(await snapshot(), 'Material')[fckRow][1].value, 41)
  assert.equal((await project()).inputs.materials.concrete.fck, 40, 'Open never applies values')
  await update()
  await go('Calculations', 'B1:B3'); await page.keyboard.press('Control+d')
  const filled = rows(await snapshot(), 'Calculations')
  assert.deepEqual(filled.slice(0, 3).map(row => row[1].value), [2, 4, 6])
  const nativeSave = await save('native-preserved', true)
  assert.equal(nativeSave.book.getWorksheet('Project').getCell('A1').font.bold, true)
  assert.equal(nativeSave.book.getWorksheet('Calculations').getCell('B3').formula, 'A3*2')
  assert.equal(nativeSave.book.getWorksheet('Material').getCell(fckRow + 1, 2).result, 41)
  console.log('Native Open, fresh calculation, fill and formatted Save passed')
  await update(); assert.equal((await project()).inputs.materials.concrete.fck, 41)
  await field('Material', 'fck (MPa)', '=1/0')
  await update(null)
  assert.equal(await editor.evaluate(() => document.documentElement.dataset.pmFailed), 'true')
  assert.match(await editor.locator('#pm_project_status').textContent(), /Material row/)
  assert.equal((await project()).inputs.materials.concrete.fck, 41)
  await screenshot('native-error')
  await close(); await open()
  // The P-M window stays usable; changed applied inputs invalidate the independent workbook.
  await page.locator('input[accept="application/json,.json"]').setInputFiles('docs/examples/realistic-sections/KDS-REAL-05-complex-stress-strain.pm-project.json')
  await page.waitForFunction(() => document.querySelector('input[aria-label^="Point 1 x"]')?.value === '-550' || document.querySelector('.pm-boundary-row')?.textContent.includes('KDS complex stress'))
  await update(null)
  assert.match(await editor.locator('#pm_project_status').textContent(), /project changed/)
  assert.deepEqual((await project()).inputs, before.inputs)
  await close()
  await importProject('docs/examples/equivalent-block/KDS-EB-01-rectangle-8-bars.pm-project.json')
  const block = await project(); await open(); await update(); await update()
  assert.deepEqual((await project()).inputs, block.inputs)
  const generic = new ExcelJS.Workbook(), genericSheet = generic.addWorksheet('Sheet1')
  genericSheet.getCell('A1').value = 123; genericSheet.getCell('A1').font = { bold: true }
  const genericFile = `${out}/independent.xlsx`; await writeFile(genericFile, new Uint8Array(await generic.xlsx.writeBuffer()))
  await openFile(genericFile, true)
  const genericSave = await save('independent-native')
  assert.equal(genericSave.book.getWorksheet('Sheet1').getCell('A1').value, 123)
  assert.equal(genericSave.book.getWorksheet('Sheet1').getCell('A1').font.bold, true)
  await update(null)
  assert.match(await editor.locator('#pm_project_status').textContent(), /P-M Project XLSX/)
  assert.deepEqual((await project()).inputs, block.inputs, 'A generic native workbook cannot bypass the project input schema')
  await close(); await open()
  // Native File menu and the original full ribbon remain present. Close the menu with Escape.
  await editor.locator('canvas').click({ position: { x: 40, y: 54 } })
  await screenshot('file-menu'); await page.keyboard.press('Escape')
  // The compact title-row right cluster replaces the old native theme shortcut as requested.
  // Reopening inherits the P-M theme; native File/View theme menu entries remain in the ribbon.
  await close(); await page.locator('button[title="Theme"]').click(); await open(); await screenshot('app-dark')
  const app = page.locator('.pm-app-window'), header = app.locator(':scope > header')
  await field('Project', 'Client', 'Preserved minimized draft')
  const draft = await snapshot(), normal = await app.boundingBox()
  await page.getByRole('button', { name: 'Maximize Excel', exact: true }).click()
  const full = await app.boundingBox()
  assert.ok(full.width > normal.width && full.height > normal.height)
  assert.ok(full.x <= 6 && full.y <= 6)
  await screenshot('maximized')
  await page.getByRole('button', { name: 'Minimize Excel', exact: true }).click()
  assert.ok((await app.boundingBox()).height < 64)
  await screenshot('minimized')
  await page.getByRole('button', { name: 'Restore Excel', exact: true }).click()
  assert.deepEqual(await app.boundingBox(), full, 'Restore after minimizing a maximized window retains its state')
  await page.getByRole('button', { name: 'Restore Excel', exact: true }).click()
  assert.deepEqual(await app.boundingBox(), normal)
  assert.deepEqual(await snapshot(), draft, 'Window controls preserve formulas, values and layout')
  await page.getByRole('button', { name: 'Minimize Excel', exact: true }).click()
  await update()
  assert.ok((await app.boundingBox()).height < 64, 'Update remains usable from the compact app bar')
  await page.getByRole('button', { name: 'Restore Excel', exact: true }).click()
  assert.deepEqual(await snapshot(), draft)
  const drag = await page.locator('.pm-window-title-drag').boundingBox()
  await page.mouse.move(drag.x + drag.width / 2, drag.y + drag.height / 2)
  await page.mouse.down(); await page.mouse.move(drag.x + drag.width / 2 + 12, drag.y + drag.height / 2 + 8, { steps: 4 }); await page.mouse.up()
  const dragged = await app.boundingBox()
  assert.equal(dragged.x, normal.x + 12); assert.equal(dragged.y, normal.y + 8)
  await header.focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Shift+ArrowDown')
  const moved = await app.boundingBox()
  assert.equal(moved.x, dragged.x + 10); assert.equal(moved.height, normal.height + 10)
  await page.getByRole('button', { name: 'Maximize Excel', exact: true }).click()
  assert.deepEqual(await app.boundingBox(), full, 'Maximize still fills the viewport after manual resizing')
  await page.getByRole('button', { name: 'Restore Excel', exact: true }).click()
  assert.deepEqual(await app.boundingBox(), moved)
  await page.getByRole('button', { name: 'Minimize Excel', exact: true }).click()
  await openFromProjectMenu()
  assert.deepEqual(await app.boundingBox(), moved, 'Project Open restores the existing draft and bounds')
  assert.deepEqual(await snapshot(), draft)
  await page.setViewportSize({ width: 960, height: 700 }); await screenshot('resized')
  const small = await app.boundingBox(); assert.ok(small.width <= 948 && small.height <= 688)
  await editor.locator('canvas').focus(); await page.keyboard.press('Escape')
  assert.equal(await app.count(), 1, 'Native Escape does not close the application window')
  await page.reload({ waitUntil: 'networkidle' })
  evidence.closedWithParent = await page.locator('.pm-app-window').count() === 0
  evidence.singleNativeTitleRow = true; evidence.leftOpenSaveUndoRedo = true; evidence.titleDrag = true; evidence.windowControls = true; evidence.minimizedDraftPreserved = true
  assert.deepEqual(errors, [])
  await writeFile(`${out}/evidence.json`, JSON.stringify({ ...evidence, nativeMenus: true, noPmModal: true, nativeSaveOpen: true,
    formulaSave: true, nativeFormattingPreserved: true, helpersIndependent: true, fastTyping: true, nativeFill: true,
    atomicRepeatedUpdate: true, staleCacheRecalculated: true, invalidAndStaleBlocked: true, equivalentBlockNoop: true, errors }, null, 2))
  console.log('PASS: native Gridcraft window, original Open/Save/menus, formula editing and evaluated-only atomic Update')
} finally {
  if (await page.locator('.pm-app-window').count()) await screenshot('final').catch(() => {})
  await writeFile(`${out}/errors.json`, JSON.stringify(errors)); await browser.close()
}
