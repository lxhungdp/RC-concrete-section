/** Capture the visible opening frames and the host handshake in an isolated browser. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PM_PLAYWRIGHT_MODULE ?? 'playwright')
const out = process.env.PM_EVIDENCE_DIR ?? 'outputs/gridcraft/opening'
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-unsafe-webgpu'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
page.setDefaultTimeout(60_000)
const errors = [], frames = []
page.on('pageerror', error => errors.push(error.message))
await page.addInitScript(() => {
  window.__sheetOpening = []
  addEventListener('message', event => {
    if (event.origin === location.origin && event.source === document.querySelector('iframe[title="Loadcase spreadsheet"]')?.contentWindow && event.data?.type === 'pm-gridcraft') {
      window.__sheetOpening.push({ at: Date.now(), event: event.data.event, id: event.data.id,
        opened: event.data.data?.opened, ok: event.data.ok })
      if (window.__closeOnSheetTheme && event.data.ok && event.data.id && !event.data.data?.opened) {
        window.__closeOnSheetTheme = false
        requestAnimationFrame(() => {
          window.__cancelledSheetPresented = document.querySelector('.pm-spreadsheet-dialog iframe')?.dataset.presented
          document.querySelector('[aria-label="Close Loadcases"]')?.click()
        })
      }
    }
  })
})
let cdp
try {
  await page.goto(process.env.PM_TEST_URL ?? 'http://127.0.0.1:3017', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Project menu', exact: true }).click()
  await page.getByLabel('Project file format').selectOption('json')
  const picker = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Import project from JSON' }).click()
  await (await picker).setFiles('docs/examples/equivalent-block/KDS-EB-01-rectangle-8-bars.pm-project.json')
  await page.getByRole('button', { name: 'Demand Check', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.pm-results-stage')?.dataset.fieldFrame === 'current')
  if (process.env.PM_TEST_THEME === 'dark') {
    await page.evaluate(() => { document.body.dataset.jscadTheme = 'dark' })
  }
  if (process.env.PM_OPENING_NARROW === '1') await page.setViewportSize({ width: 390, height: 900 })
  cdp = await page.context().newCDPSession(page)
  await cdp.send('Page.enable')
  cdp.on('Page.screencastFrame', event => {
    void cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => {})
    if (frames.length < 120) frames.push({ at: event.metadata.timestamp * 1000, data: event.data })
  })
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, maxWidth: 1440, maxHeight: 1000, everyNthFrame: 1 })
  await page.evaluate(() => {
    window.__openingSamples = []; window.__captureOpening = true
    const sample = () => {
      const frame = document.querySelector('.pm-spreadsheet-dialog iframe')
      const loading = document.querySelector('.pm-spreadsheet-loading')
      if (frame) window.__openingSamples.push({ at: Date.now(), opacity: getComputedStyle(frame).opacity,
        presented: frame.dataset.presented, busy: frame.getAttribute('aria-busy'),
        loadingVisible: !!loading && loading.clientWidth > 1 && loading.clientHeight > 1 })
      if (window.__captureOpening) requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  })
  const started = Date.now()
  await page.getByRole('button', { name: 'Open XLSX', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.pm-spreadsheet-dialog .ws-action--primary')?.disabled === false)
  const enabled = Date.now()
  await page.evaluate(() => new Promise(resolve => {
    let count = 0
    const next = () => { if (++count === 12) resolve(); else requestAnimationFrame(next) }
    requestAnimationFrame(next)
  }))
  await cdp.send('Page.stopScreencast')
  const { messages, samples } = await page.evaluate(() => {
    window.__captureOpening = false
    return { messages: window.__sheetOpening, samples: window.__openingSamples }
  })
  const frameIndex = await Promise.all(frames.map(async (frame, index) => {
    const file = `${String(index).padStart(3, '0')}.jpg`
    await writeFile(`${out}/${file}`, Buffer.from(frame.data, 'base64'))
    return { file, ms: Math.round(frame.at - started) }
  }))
  const presentation = await page.locator('.pm-spreadsheet-dialog iframe').evaluate(node => {
    const loading = node.contentDocument.querySelector('#gridcraft_loading')
    return { opacity: getComputedStyle(node).opacity, presented: node.dataset.presented,
      loading: loading?.textContent, loadingDisplay: loading ? getComputedStyle(loading).display : 'removed' }
  })
  if (process.env.PM_ASSERT_PRESENTED === '1') {
    assert.equal(presentation.presented, 'true')
    assert.ok(samples.some(sample => sample.opacity === '0'), 'Hide the boot/loading/empty-sheet frames')
    assert.ok(samples.filter(sample => sample.opacity === '0').every(sample => sample.loadingVisible), 'Keep the parent loading surface visible, including narrow layouts')
    assert.ok(samples.every(sample => sample.opacity !== '1' || sample.presented === 'true'), 'Only reveal the presented workbook')
    const themeReply = messages.find(message => message.ok && message.id && !message.opened)
    assert.ok(themeReply)
    assert.ok(samples.filter(sample => sample.opacity === '1').every(sample => sample.at >= themeReply.at), 'Apply the theme before revealing the grid')
  }
  const recovery = { cancelledDuringPresentation: false, startupFailureCovered: false, reopened: false }
  if (process.env.PM_ASSERT_PRESENTED === '1') {
    const dialog = page.getByRole('dialog', { name: 'Loadcases', exact: true })
    await dialog.getByRole('button', { name: 'Close Loadcases', exact: true }).click()
    await page.evaluate(() => { window.__closeOnSheetTheme = true })
    await page.getByRole('button', { name: 'Open XLSX', exact: true }).click()
    await dialog.waitFor({ state: 'visible' }); await dialog.waitFor({ state: 'detached' })
    assert.equal(await page.evaluate(() => window.__closeOnSheetTheme), false)
    assert.equal(await page.evaluate(() => window.__cancelledSheetPresented), 'false')
    recovery.cancelledDuringPresentation = true
    await page.route('**/gridcraft_bg.wasm', route => route.abort('failed'))
    await page.getByRole('button', { name: 'Open XLSX', exact: true }).click()
    await dialog.getByRole('alert').filter({ hasText: 'Spreadsheet could not start' }).waitFor()
    assert.equal(await dialog.locator('iframe').evaluate(node => getComputedStyle(node).opacity), '0')
    assert.equal(await dialog.getByRole('button', { name: 'Update', exact: true }).isDisabled(), true)
    recovery.startupFailureCovered = true
    await dialog.getByRole('button', { name: 'Close Loadcases', exact: true }).click()
    await page.unroute('**/gridcraft_bg.wasm')
    await page.getByRole('button', { name: 'Open XLSX', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('.pm-spreadsheet-dialog .ws-action--primary')?.disabled === false)
    assert.equal(await dialog.locator('iframe').getAttribute('data-presented'), 'true')
    recovery.reopened = true
    await dialog.getByRole('button', { name: 'Close Loadcases', exact: true }).click()
  }
  assert.deepEqual(errors, [])
  await writeFile(`${out}/evidence.json`, JSON.stringify({ browser: browser.version(), theme: process.env.PM_TEST_THEME ?? 'light',
    enabledMs: enabled - started, messages: messages.map(message => ({ ...message, ms: message.at - started })),
    frames: frameIndex, samples: samples.map(sample => ({ ...sample, ms: sample.at - started })), presentation, recovery, errors }, null, 2))
  console.log(JSON.stringify({ enabledMs: enabled - started, frames: frameIndex, presentation, recovery, errors }))
} finally {
  await browser.close()
}
