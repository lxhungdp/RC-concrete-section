/** Capture intermediate compositor frames, not only the settled P-M chart. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'

const { chromium } = createRequire(import.meta.url)(process.env.PM_PLAYWRIGHT_MODULE ?? 'playwright')
const out = process.env.PM_EVIDENCE_DIR ?? 'outputs/demand-navigation-transition'
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } })
page.setDefaultTimeout(90000)
const errors = []
page.on('pageerror', error => errors.push(error.message))
await page.addInitScript(() => {
  window.__transition = { active: false, frames: [], jobs: [] }
  const post = Worker.prototype.postMessage
  Worker.prototype.postMessage = function (data, ...rest) {
    window.__transition.jobs.push({ time: performance.now(), type: data.type })
    return post.call(this, data, ...rest)
  }
  let last = ''
  const capture = () => {
    if (window.__transition.active) {
      const stage = document.querySelector('.pm-results-stage')
      const panel = document.querySelector('[data-chart="vertical"]')
      const host = panel?.querySelector('.pm-plotly-host')
      const plot = host?._fullLayout
      const frame = {
        busy: stage?.getAttribute('aria-busy'), frame: stage?.dataset.fieldFrame,
        primary: panel?.classList.contains('is-primary'),
        host: Boolean(host), updating: host?.classList.contains('is-updating'),
        traces: host?.data?.map(t => ({ name: t.name, points: t.x?.length ?? 0, width: t.line?.width })),
        x: plot?.xaxis?.range, y: plot?.yaxis?.range,
        size: host ? [host.clientWidth, host.clientHeight] : null,
        paths: [...(host?.querySelectorAll('.scatterlayer path.js-line') ?? [])].map(path => ({
          color: getComputedStyle(path).stroke, width: getComputedStyle(path).strokeWidth,
          d: path.getAttribute('d')
        }))
      }
      const key = JSON.stringify(frame)
      if (key !== last) window.__transition.frames.push({ time: performance.now(), ...frame })
      last = key
    }
    requestAnimationFrame(capture)
  }
  requestAnimationFrame(capture)
})
const settled = () => page.waitForFunction(() => {
  const stage = document.querySelector('.pm-results-stage')
  const plot = document.querySelector('[data-chart="vertical"] .js-plotly-plot')
  return stage?.getAttribute('aria-busy') === 'false' && stage.dataset.fieldFrame === 'current' &&
    plot?.data?.some(t => t.name === 'Direct β · Design') && !plot.classList.contains('is-updating')
})
const resized = () => page.evaluate(() => new Promise(resolve => {
  let last = '', stable = 0
  const observe = () => {
    const host = document.querySelector('[data-chart="vertical"] .js-plotly-plot')
    const value = JSON.stringify([host?.clientWidth, host?.clientHeight,
      host?._fullLayout?.xaxis?.range, host?._fullLayout?.yaxis?.range])
    stable = value === last ? stable + 1 : 0
    last = value
    if (stable >= 8) resolve()
    else requestAnimationFrame(observe)
  }
  requestAnimationFrame(observe)
}))
const snapshot = () => page.locator('[data-chart="vertical"] .js-plotly-plot').evaluate(plot => ({
  data: plot.data.map(t => ({ name: t.name, x: t.x, y: t.y })),
  x: plot._fullLayout.xaxis.range, y: plot._fullLayout.yaxis.range
}))
const fit = async () => {
  await resized()
  // The existing UI revision preserves the small-chart viewport when making it large.
  // Establish the automatic viewport at its final dimensions before comparing a fresh mount.
  await page.locator('[data-chart="vertical"] [data-title="Autoscale"]').click()
  await resized()
}
const assertComplete = frames => {
  const partial = frames.filter(frame => frame.frame && frame.traces?.some(t => /load path/u.test(t.name)) &&
    !frame.traces.some(t => t.name === 'Direct β · Design'))
  assert.deepEqual(partial, [], 'A menu return never paints a ray-only incomplete Direct-beta frame')
}
const roundTrip = async label => {
  await settled()
  await fit()
  const expected = await snapshot()
  const jobs = await page.evaluate(() => window.__transition.jobs.length)
  await page.getByRole('button', { name: 'Capacity', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('[data-chart="vertical"] .js-plotly-plot')?.data?.some(t => t.name?.startsWith('Direct β =')))
  await page.evaluate(() => { window.__transition.frames = []; window.__transition.active = true })
  await page.getByRole('button', { name: 'Demand Check', exact: true }).click()
  await settled()
  await resized()
  await page.evaluate(() => { window.__transition.active = false })
  const observed = await page.evaluate(() => window.__transition)
  assertComplete(observed.frames)
  assert.deepEqual(await snapshot(), expected, label + ': complete traces and axes')
  assert.deepEqual(observed.jobs.slice(jobs), [], label + ': no navigation analysis jobs')
  return { label, frames: observed.frames }
}
try {
  await page.goto(process.env.PM_TEST_URL ?? 'http://127.0.0.1:3106', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Project menu', exact: true }).click()
  await page.getByText('Example files', { exact: true }).click()
  await page.locator('.pm-project-menu__example').first().click()
  await page.getByRole('button', { name: 'Demand Check', exact: true }).click()
  await settled()
  await page.locator('[data-chart="vertical"] button[title="Make this the large chart"]').click()
  await settled()
  await fit()
  const expected = await snapshot()
  const jobsBefore = await page.evaluate(() => window.__transition.jobs.length)
  await page.getByRole('button', { name: 'Capacity', exact: true }).click()
  await page.waitForSelector('[data-chart="surface3d"] .js-plotly-plot')
  await page.waitForFunction(() => document.querySelector('[data-chart="vertical"] .js-plotly-plot')?.data?.some(t => t.name?.startsWith('Direct β =')))
  const cdp = await page.context().newCDPSession(page)
  const images = []
  cdp.on('Page.screencastFrame', event => {
    images.push({ data: event.data, metadata: event.metadata })
    void cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId })
  })
  await cdp.send('Page.startScreencast', { format: 'png', maxWidth: 1600, maxHeight: 1100, everyNthFrame: 1 })
  await page.evaluate(() => { window.__transition.active = true })
  await page.getByRole('button', { name: 'Demand Check', exact: true }).click()
  await settled()
  await resized()
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await page.evaluate(() => { window.__transition.active = false })
  await cdp.send('Page.stopScreencast')
  const observed = await page.evaluate(() => window.__transition)
  const actual = await snapshot()
  await writeFile(out + '/transition.json', JSON.stringify({ expected, actual, observed, errors,
    compositor: images.map((frame, i) => ({ file: `frame-${String(i).padStart(3, '0')}.png`, ...frame.metadata })) }, null, 2))
  await Promise.all(images.map((frame, i) => writeFile(`${out}/frame-${String(i).padStart(3, '0')}.png`, Buffer.from(frame.data, 'base64'))))
  await page.screenshot({ path: out + '/settled.png' })
  assertComplete(observed.frames)
  assert.deepEqual(actual, expected, 'Settled coordinates and axes remain unchanged')
  assert.deepEqual(observed.jobs.slice(jobsBefore), [], 'Unchanged menu navigation launches no analysis jobs')
  assert.deepEqual(errors, [])
  const scenarios = []
  const invalidation = []
  if (!process.argv.includes('--repro-only')) {
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') await page.locator('button[title="Theme"]').click()
      for (const basis of ['3D load ray', 'Constant P']) {
        await page.getByRole('radio', { name: basis, exact: true }).check()
        await settled()
        for (const theta of [false, true]) {
          await page.getByLabel('Load-angle section θ', { exact: true }).setChecked(theta)
          for (const primary of ['vertical', 'heatmap']) {
            await page.locator(`[data-chart="${primary}"] button[title="Make this the large chart"]`).click()
            for (let repeat = 0; repeat < 2; repeat++) {
              scenarios.push(await roundTrip(`${theme}/${basis}/theta-${theta}/${primary}/${repeat}`))
            }
          }
        }
      }
    }
    await page.setViewportSize({ width: 390, height: 1000 })
    for (const primary of ['vertical', 'heatmap']) {
      await page.locator(`[data-chart="${primary}"] button[title="Make this the large chart"]`).click()
      scenarios.push(await roundTrip(`dark/narrow/${primary}`))
    }
    await page.screenshot({ path: out + '/narrow-dark.png', fullPage: true })

    await page.setViewportSize({ width: 1600, height: 1100 })
    await page.getByRole('radio', { name: '3D load ray', exact: true }).check()
    await settled()
    const selectionJobs = await page.evaluate(() => window.__transition.jobs.length)
    await page.locator('.pm-loadcase-table tbody tr').nth(2).focus()
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => document.querySelector('.pm-results-stage')?.dataset.displayedLoadcase === '3')
    await settled()
    const selected = await snapshot()
    assert.equal(selected.data.find(t => t.name === 'Demand point').y[0], 5000)
    assert.ok((await page.evaluate(() => window.__transition.jobs)).slice(selectionJobs).some(job => job.type === 'checkLoadcase'),
      'Selecting an unevaluated row still requests its detail')
    invalidation.push({ selectedLoadcase: 3, demandPoint: selected.data.find(t => t.name === 'Demand point') })

    const editJobs = await page.evaluate(() => window.__transition.jobs.length)
    const pu = page.getByRole('textbox', { name: 'Loadcase 3 Pu (kN)', exact: true })
    await pu.focus()
    await page.waitForFunction(() => document.querySelector('input[aria-label="Loadcase 3 Pu (kN)"]')?.value === '5000')
    await pu.fill('6000')
    await pu.press('Enter')
    await page.waitForFunction(() => {
      const stage = document.querySelector('.pm-results-stage')
      const plot = document.querySelector('[data-chart="vertical"] .js-plotly-plot')
      return stage?.dataset.fieldFrame === 'current' && stage.getAttribute('aria-busy') === 'false' &&
        plot?.data?.find(t => t.name === 'Demand point')?.y[0] === 6000
    })
    const edited = await snapshot()
    assert.ok((await page.evaluate(() => window.__transition.jobs)).slice(editJobs).some(job => job.type === 'checkLoadcase'),
      'An edited demand is recalculated instead of reusing the completed old frame')
    invalidation.push({ editedLoadcase: 3, demandPoint: edited.data.find(t => t.name === 'Demand point') })
    scenarios.push(await roundTrip('edited-demand/retained-current-frame'))
  }
  await writeFile(out + '/scenarios.json', JSON.stringify({ scenarios, invalidation, errors }, null, 2))
  console.log(JSON.stringify({ compositorFrames: images.length, intermediateStates: observed.frames.length,
    roundTrips: scenarios.length + 1, errors }))
  assert.deepEqual(errors, [])
} finally { await browser.close() }
