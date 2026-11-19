/** Fault-injection checks for optional chunk preloads and actual workspace navigation. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PM_PLAYWRIGHT_MODULE ?? 'playwright')
const beforeFix = process.argv.includes('--expect-unhandled')
const dev = process.argv.includes('--dev')
const phase = `${beforeFix ? 'before' : 'after'}${dev ? '-dev' : ''}`
const out = 'outputs/module-loading'
await mkdir(out, { recursive: true })
const manifest = JSON.parse(await readFile('apps/web/.next/react-loadable-manifest.json', 'utf8'))
const filesFor = names => dev
  ? names.map(name => `static/chunks/_app-pages-browser_features_section-editor_${name === 'ResultsWorkspace' ? 'results' : 'analysis'}_${name}_tsx.js`)
  : Object.entries(manifest).filter(([key]) => names.some(name => key.endsWith(`/${name}`)))
    .flatMap(([, value]) => value.files).filter(file => file.endsWith('.js'))
const browser = await chromium.launch({ channel: process.env.PM_BROWSER_CHANNEL ?? 'msedge', headless: true })
const evidence = []
try {
  for (const item of [
    { menu: 'Capacity', modules: ['ResultsWorkspace'], mounted: '.pm-results-grid' },
    { menu: 'Options', modules: ['AnalysisMeshWorkspace', 'EquivalentBlockGeometryWorkspace'], mounted: '.pm-equivalent-block-preview' }
  ]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const chunks = filesFor(item.modules)
    assert.equal(chunks.length, item.modules.length)
    const failedRequests = []
    const loaded = []
    let fail = true
    await page.addInitScript(() => {
      window.__preloadErrors = []
      addEventListener('unhandledrejection', event => window.__preloadErrors.push(String(event.reason)))
    })
    for (const file of chunks) await page.route(`**/_next/${file}`, async route => {
      if (fail) { failedRequests.push(route.request().url()); await route.abort('failed') }
      else await route.continue()
    })
    page.on('response', response => { if (chunks.some(file => response.url().endsWith(file))) loaded.push(response.status()) })
    await page.goto(process.env.PM_TEST_URL ?? 'http://127.0.0.1:3211', { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Project menu' }).click()
    await page.getByLabel('Project file format').selectOption('json')
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Import project from JSON' }).click()
    await (await chooser).setFiles('docs/examples/equivalent-block/ACI-EB-01-rectangle-8-bars.pm-project.json')
    await page.getByRole('tab', { name: 'Rebar', exact: true }).waitFor()
    const menu = page.getByRole('button', { name: item.menu, exact: true })
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: 'Section', exact: true }).hover()
      await menu.hover()
      await page.waitForTimeout(200)
    }
    await menu.focus()
    await page.waitForTimeout(200)
    assert.ok(failedRequests.length >= 2, 'repeated hover/focus must exercise failed chunk requests')
    const errors = await page.evaluate(() => window.__preloadErrors)
    if (beforeFix) assert.ok(errors.filter(error => error.includes('ChunkLoadError')).length >= 2)
    else assert.deepEqual(errors, [], 'optional preloads must not create unhandled Promise rejections')
    assert.equal(await page.getByRole('button', { name: 'Section', exact: true }).getAttribute('aria-pressed'), 'true')
    fail = false
    await menu.click()
    await page.locator(item.mounted).waitFor({ timeout: 60000 })
    assert.ok(loaded.includes(200), 'navigation retries loading after a failed preload')
    assert.equal(await page.getByRole('button', { name: item.menu, exact: true }).getAttribute('aria-pressed'), 'true')
    const afterNavigation = await page.evaluate(() => window.__preloadErrors)
    assert.deepEqual(afterNavigation, errors)
    assert.equal(await page.getByRole('heading', { name: 'The workspace could not continue safely.' }).count(), 0)
    await page.screenshot({ path: `${out}/${phase}-${item.menu.toLowerCase()}-recovered.png` })
    evidence.push({ menu: item.menu, failedPreloadRequests: failedRequests.length, unhandledErrors: errors,
      recoveredResponses: loaded, navigationRendered: true })
    await page.close()
  }
  if (!beforeFix && !dev) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    let documentRequests = 0
    page.on('request', request => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentRequests++
    })
    for (const file of filesFor(['ResultsWorkspace'])) await page.route(`**/_next/${file}`, route => route.abort('failed'))
    await page.goto(process.env.PM_TEST_URL ?? 'http://127.0.0.1:3211', { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Project menu' }).click()
    await page.getByLabel('Project file format').selectOption('json')
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Import project from JSON' }).click()
    await (await chooser).setFiles('docs/examples/equivalent-block/ACI-EB-01-rectangle-8-bars.pm-project.json')
    await page.getByRole('button', { name: 'Capacity', exact: true }).click()
    await page.getByRole('heading', { name: 'The workspace could not continue safely.' }).waitFor({ timeout: 60000 })
    assert.equal(await page.getByRole('button', { name: 'Reload application', exact: true }).isVisible(), true)
    await page.waitForTimeout(250)
    assert.equal(documentRequests, 1, 'failed navigation must not automatically reload the document')
    evidence.push({ menu: 'Capacity', permanentFailure: 'visible application recovery', documentRequests, autoReload: false })
    await page.screenshot({ path: `${out}/after-persistent-failure.png` })
    await page.close()
  }
  await writeFile(`${out}/${phase}-evidence.json`, JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify(evidence, null, 2))
} finally { await browser.close() }
