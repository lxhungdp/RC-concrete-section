/** REBAR-AS-001..004: exercise the published UI and inspect exported canonical inputs. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PM_PLAYWRIGHT_MODULE ?? 'playwright')
const out = 'outputs/rebar-catalog'
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: process.env.PM_BROWSER_CHANNEL ?? 'msedge', headless: true })
const evidence = []
let activePage
try {
  for (const [mechanics, fixture] of [
    ['equivalent-block', 'docs/examples/equivalent-block/ACI-EB-01-rectangle-8-bars.pm-project.json'],
    ['stress-strain', 'docs/examples/realistic-sections/KDS-REAL-05-complex-stress-strain.pm-project.json']
  ]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    activePage = page
    const errors = []
    page.on('pageerror', error => { errors.push(error.message); console.error('PAGE ERROR', error.message) })
    page.on('dialog', dialog => dialog.accept())
    await page.addInitScript(() => {
      window.__areaAudit = { jobs: [], surfaces: [] }
      const OriginalWorker = window.Worker
      window.Worker = class extends OriginalWorker {
        constructor(...args) {
          super(...args)
          this.addEventListener('message', ({ data }) => {
            if (data.type === 'success' && data.requestType === 'buildSurface') window.__areaAudit.surfaces.push(JSON.stringify(data.result))
          })
        }
        postMessage(message, ...rest) { window.__areaAudit.jobs.push(message.type); return super.postMessage(message, ...rest) }
      }
    })
    await page.goto(process.env.PM_TEST_URL ?? 'http://127.0.0.1:3001', { waitUntil: 'networkidle' })
    const importFile = async (file, format) => {
      await page.getByRole('button', { name: 'Project menu' }).click()
      await page.getByLabel('Project file format').selectOption(format === 'xlsx' ? 'excel' : format)
      const chooser = page.waitForEvent('filechooser')
      await page.getByRole('button', { name: format === 'json' ? 'Import project from JSON' : 'Import project from Excel' }).click()
      await (await chooser).setFiles(file)
    }
    const exportFile = async format => {
      await page.getByRole('button', { name: 'Project menu' }).click()
      await page.getByLabel('Project file format').selectOption(format === 'xlsx' ? 'excel' : format)
      const received = page.waitForEvent('download')
      await page.getByRole('button', { name: format === 'json' ? 'Export project to JSON' : 'Export project to Excel' }).click()
      const download = await received
      const path = `${out}/${mechanics}-roundtrip.${format === 'json' ? 'json' : 'xlsx'}`
      await download.saveAs(path)
      return path
    }
    const inputs = async () => JSON.parse(await readFile(await exportFile('json'), 'utf8')).inputs
    const rebar = async () => {
      await page.getByRole('button', { name: 'Section', exact: true }).click()
      await page.getByRole('tab', { name: 'Rebar', exact: true }).click()
      await page.getByLabel('Generator As').waitFor()
    }
    const preset = async value => {
      await page.getByRole('button', { name: 'Options', exact: true }).click()
      await page.getByRole('tab', { name: 'Units', exact: true }).click()
      await page.getByRole('button', { name: value === 'us' ? 'US' : 'Metric', exact: true }).click()
      await rebar()
    }
    const dia = () => page.locator('[data-rebar-diameter]')
    const area = () => page.getByRole('textbox', { name: /^Generator As \(/ })
    const edit = async (input, value) => { await input.focus(); await input.fill(value); await input.press('Enter') }
    const fullValue = async input => { await input.focus(); const value = Number(await input.inputValue()); await input.press('Tab'); return value }
    await importFile(fixture, 'json')
    await page.waitForFunction(() => window.__areaAudit.surfaces.length > 0, null, { timeout: 60000 })
    await rebar()
    const generatorLayout = async () => page.locator('.pm-rebar-quick').evaluate(el => {
      const rect = node => { const box = node.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height } }
      return { geometry: [...el.querySelectorAll('.pm-rebar-params > .pm-field')].slice(0, 2).map(rect),
        properties: [...el.querySelectorAll('.pm-rebar-area .ws-field-group, .pm-rebar-area button')].map(rect),
        scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }
    })
    const normalLayout = await generatorLayout()
    assert.equal(normalLayout.geometry[0].y, normalLayout.geometry[1].y, 'Cover and Count share a row')
    assert.equal(new Set(normalLayout.properties.map(rect => rect.y + rect.height)).size, 1, 'Dia, As and fill actions share the next row')
    assert.deepEqual(normalLayout.properties.map(rect => rect.height), [26, 26, 26, 26], 'fill buttons retain standard input height')
    assert.ok(normalLayout.properties[0].width >= 80, 'Dia retains a readable editor width')
    assert.ok(normalLayout.properties[0].y > normalLayout.geometry[0].y)
    await page.screenshot({ path: `${out}/${mechanics}-generator-layout-light.png` })
    await page.getByRole('button', { name: 'Spacing', exact: true }).click()
    const spacingLayout = await generatorLayout()
    assert.equal(spacingLayout.geometry[0].y, spacingLayout.geometry[1].y, 'Cover and Spacing share a row')
    await page.getByRole('button', { name: 'Top / Bottom', exact: true }).click()
    const resizer = page.getByRole('separator', { name: 'Resize side panel' })
    await resizer.focus(); await resizer.press('Home')
    const narrowLayout = await generatorLayout()
    assert.equal(narrowLayout.scrollWidth, narrowLayout.clientWidth, 'narrow sidebar wraps whole fill-action group')
    await resizer.dblclick()
    const original = await inputs()
    const audit = await page.evaluate(() => structuredClone(window.__areaAudit))
    await edit(dia(), '25')
    await page.getByRole('button', { name: 'Equation', exact: true }).click()
    assert.equal(await fullValue(area()), (Math.PI * 25 * 25) / 4)
    await edit(dia(), '20')
    assert.equal(await fullValue(area()), (Math.PI * 25 * 25) / 4, 'diameter edits do not rerun an equation')
    await edit(area(), '500')
    await page.getByRole('button', { name: 'Catalog', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Rebar catalog', exact: true })
    await dialog.waitFor()
    assert.equal(await dialog.getByRole('searchbox').count(), 0)
    assert.equal(await dialog.getByRole('tab').count(), 10)
    const catalogWidth = await dialog.evaluate(el => el.getBoundingClientRect().width)
    assert.equal(catalogWidth, 520, 'catalog uses the shared compact project-dialog width')
    const sourceLayout = async () => {
      const source = dialog.locator('.pm-rebar-catalog-source')
      const layout = await source.evaluate(el => {
        const rect = el.getBoundingClientRect()
        const link = el.querySelector('a')
        return { text: el.textContent, height: rect.height, lineHeight: Number.parseFloat(getComputedStyle(el).lineHeight),
          title: link.title, href: link.href }
      })
      assert.ok(layout.height <= layout.lineHeight + 1, 'source stays on one row')
      assert.ok(!layout.text.includes('Accessed'), 'source details stay in the native tooltip')
      assert.match(layout.title, /Accessed 2026-10-(27|29)\./)
      assert.match(layout.href, /^https:\/\//)
      return layout
    }
    const desktopSources = []
    let rows = 0
    for (const tab of await dialog.getByRole('tab').all()) {
      await tab.click()
      rows += await dialog.locator('tbody tr').count()
      desktopSources.push(await sourceLayout())
      assert.deepEqual(await dialog.locator('tbody td:nth-child(n+3)').evaluateAll(cells =>
        cells.filter(cell => cell.scrollWidth > cell.clientWidth).map(cell => cell.textContent)), [], 'all published numbers fit the compact modal')
    }
    assert.equal(rows, 101)
    await dialog.getByRole('tab', { name: 'KS', exact: true }).click()
    await dialog.getByRole('radio', { name: 'Select D25', exact: true }).check()
    assert.deepEqual(await dialog.locator('tbody td:nth-child(n+3)').evaluateAll(cells =>
      cells.filter(cell => cell.scrollWidth > cell.clientWidth).map(cell => cell.textContent)), [], 'published numbers are fully visible')
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    assert.equal(await fullValue(area()), 500)
    assert.equal(await fullValue(dia()), 20)
    await page.getByRole('button', { name: 'Catalog', exact: true }).click()
    await dialog.getByRole('tab', { name: 'KS', exact: true }).focus()
    await page.keyboard.press('End')
    assert.equal(await dialog.getByRole('tab', { name: 'Canada', exact: true }).getAttribute('aria-selected'), 'true')
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'hidden' })
    await page.getByRole('button', { name: 'Catalog', exact: true }).click()
    await dialog.getByRole('radio', { name: 'Select D25', exact: true }).check()
    await page.screenshot({ path: `${out}/${mechanics}-catalog-light.png` })
    await dialog.getByRole('button', { name: 'Use selected bar', exact: true }).click()
    assert.equal(await fullValue(dia()), 25.4)
    assert.equal(await fullValue(area()), 506.7)
    await edit(dia(), '20')
    assert.equal(await fullValue(area()), 506.7)
    await edit(area(), '500')
    await preset('us')
    await edit(area(), '0.5')
    await preset('metric')
    assert.ok(Math.abs(await fullValue(area()) - 322.58) < 1e-12)
    await edit(area(), '500')
    await preset('us'); await preset('metric')
    assert.equal(await fullValue(area()), 500)
    assert.deepEqual(await inputs(), original, 'fill/edit/unit actions are only proposals until Generate')
    const retainedAudit = await page.evaluate(() => structuredClone(window.__areaAudit))
    assert.deepEqual(retainedAudit.surfaces, audit.surfaces)
    assert.deepEqual(retainedAudit.jobs.slice(audit.jobs.length).filter(job => job !== 'buildSectionMesh'), [])
    await page.getByRole('button', { name: 'Generate', exact: true }).click()
    const generated = await inputs()
    assert.ok(generated.geometry.rebars.length > 0)
    for (const bar of generated.geometry.rebars) {
      assert.equal(bar.dia, 20); assert.equal(bar.area, 500)
      assert.deepEqual(bar.areaSource, { type: 'manual' })
    }
    const firstId = generated.geometry.rebars[0].id
    await edit(page.getByRole('textbox', { name: new RegExp(`^Bar ${firstId} As \\(`) }), '450')
    await edit(page.getByRole('textbox', { name: new RegExp(`^Bar ${firstId} diameter \\(`) }), '18')
    const edited = await inputs()
    assert.equal(edited.geometry.rebars[0].area, 450)
    assert.equal(edited.geometry.rebars[0].dia, 18)
    const input = page.getByRole('textbox', { name: new RegExp(`^Bar ${firstId} As \\(`) })
    const restingBorder = await input.evaluate(el => getComputedStyle(el).borderColor)
    await input.focus()
    const focusBorder = await input.evaluate(el => getComputedStyle(el).borderColor)
    assert.notEqual(restingBorder, focusBorder)
    await input.press('Tab')
    await page.screenshot({ path: `${out}/${mechanics}-list-light.png` })
    await preset('us')
    const excel = await exportFile('xlsx')
    await importFile(excel, 'xlsx')
    assert.deepEqual(await inputs(), edited, 'Excel browser round trip retains exact stored areas')
    await rebar()
    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    assert.equal(new Set((await generatorLayout()).properties.map(rect => rect.y + rect.height)).size, 1)
    await page.screenshot({ path: `${out}/${mechanics}-generator-layout-dark.png` })
    await page.getByRole('button', { name: 'Catalog', exact: true }).click()
    await page.setViewportSize({ width: 360, height: 700 })
    const layout = await dialog.evaluate(el => {
      const tabs = [...el.querySelectorAll('[role="tab"]')].map(tab => tab.getBoundingClientRect())
      const rect = el.getBoundingClientRect()
      return { width: rect.width, right: rect.right, top: rect.top,
        tabTop: tabs.map(tab => tab.top), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }
    })
    assert.equal(new Set(layout.tabTop).size, 1)
    assert.ok(layout.right <= 360 && layout.top >= 0 && layout.scrollWidth === layout.clientWidth)
    assert.deepEqual(await dialog.locator('tbody td:nth-child(n+3)').evaluateAll(cells =>
      cells.filter(cell => cell.scrollWidth > cell.clientWidth).map(cell => cell.textContent)), [])
    await page.screenshot({ path: `${out}/${mechanics}-catalog-dark-narrow.png` })
    const narrowSources = []
    for (const tab of await dialog.getByRole('tab').all()) {
      await tab.click()
      narrowSources.push(await sourceLayout())
    }
    await dialog.getByRole('tab', { name: 'AS/NZS AU', exact: true }).click()
    await page.screenshot({ path: `${out}/${mechanics}-catalog-source-dark-narrow.png` })
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await page.getByRole('button', { name: 'Catalog', exact: true }).click()
    await dialog.getByRole('tab', { name: 'AS/NZS AU', exact: true }).click()
    await sourceLayout()
    await page.screenshot({ path: `${out}/${mechanics}-catalog-source-light-narrow.png` })
    await page.keyboard.press('Escape')
    assert.deepEqual(errors, [])
    evidence.push({ mechanics, catalogTabs: 10, catalogWidth, publishedRows: rows, normalLayout, spacingLayout, narrowLayout, oneTimeFill: true,
      freeEdits: true, storedAreaAfterGenerate: 500, rowEditArea: 450, unitEditMm2: 322.58,
      unchangedSurfaceBeforeGenerate: true, exactExcelRoundTrip: true, layout, desktopSources, narrowSources, restingBorder, focusBorder, errors })
    await page.close()
  }
  await writeFile(`${out}/browser-evidence.json`, JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify(evidence, null, 2))
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: `${out}/failure.png` })
    console.error((await activePage.locator('body').innerText()).slice(-6000))
  }
  throw error
} finally { await browser.close() }
