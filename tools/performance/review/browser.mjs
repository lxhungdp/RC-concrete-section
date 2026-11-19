// Instrument real worker events and the first painted-frame opportunity after all 100 verdict cells match.
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
const { chromium } = createRequire(import.meta.url)(process.env.PM_PLAYWRIGHT_MODULE ?? 'playwright')
const dir = process.env.PM_PERF_OUTPUT ?? 'outputs/performance-review'
const browser = await chromium.launch({channel:'msedge', headless:true})
const results = { browser: browser.version(), samples: [] }
try {
  for (const label of ['kds-complex','as-hollow']) {
    const page = await browser.newPage({viewport:{width:1600,height:1100}})
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.addInitScript(() => {
      const jobs = new Map()
      window.perfJobs = []
      window.perfLongTasks = []
      new PerformanceObserver(list => {
        window.perfLongTasks.push(...list.getEntries().map(e => [e.startTime,e.duration]))
      }).observe({type:'longtask', buffered:true})
      const Native = window.Worker
      window.Worker = class extends Native {
        constructor(...args) {
          super(...args)
          this.addEventListener('message', ({data}) => {
            const job = jobs.get(data.jobId)
            if (!job || data.type !== 'success') return
            job.end = performance.now()
            if (data.requestType === 'checkLoadcases' && data.result.length === 100) {
              const labels = {adequate:'OK', inadequate:'NG', indeterminate:'CHECK'}
              const expected = data.result.map(c => (c.utilization === null ? '—' : c.utilization.toFixed(2)) + ' ' + labels[c.adequacy])
              const until = performance.now() + 10000
              const onFrame = () => {
                const cells = document.querySelectorAll('.pm-loadcase-ur')
                if (cells.length === expected.length && expected.every((s,i) => cells[i].innerText.replace(/\s+/g,' ').trim() === s)) {
                  job.frame = performance.now()
                } else if (performance.now() < until) requestAnimationFrame(onFrame)
              }
              requestAnimationFrame(onFrame)
            }
          })
        }
        postMessage(data,...rest) {
          const job = { type: data.type, start: performance.now(), basis:data.payload?.checkBasis,
            loads:data.payload?.loadcases?.length }
          window.perfJobs.push(job)
          jobs.set(data.jobId,job)
          return super.postMessage(data,...rest)
        }
      }
    })
    await page.goto(process.env.PM_TEST_URL ?? 'http://127.0.0.1:3058', {waitUntil:'networkidle'})
    await page.getByRole('button',{name:'Project menu'}).click()
    await page.getByLabel('Project file format').selectOption('json')
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button',{name:'Import project from JSON'}).click()
    const fileInput = await chooser
    await page.evaluate(() => { window.perfImportStart = performance.now() })
    await fileInput.setFiles(dir + '/' + label + '.pm-project.json')
    await page.getByRole('button',{name:'Demand Check',exact:true}).click()
    const awaitFrame = (basis, after) => page.waitForFunction(([basis,after]) =>
      window.perfJobs.some(j => j.basis === basis && j.loads === 100 && j.start > after && j.frame),
      [basis,after],{timeout:45000})
    await awaitFrame('proportional3D',0)
    for (const [basis,name] of [['constantAxial','Constant P'],['proportional3D','3D load ray'],['constantAxial','Constant P']]) {
      const after = await page.evaluate(() => performance.now())
      await page.getByRole('radio',{name,exact:true}).check()
      await awaitFrame(basis,after)
    }
    results.samples.push({label,errors,...await page.evaluate(() => ({
      importStart:window.perfImportStart, jobs:window.perfJobs, longTasks:window.perfLongTasks,
      plotlyDivs:document.querySelectorAll('.js-plotly-plot').length }))})
    if (errors.length) throw new Error(errors.join('\n'))
    writeFileSync(dir + '/browser.json', JSON.stringify(results,null,2))
    await page.close()
  }
} finally { await browser.close() }
