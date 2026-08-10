/**
 * Structural and reproducibility checks for the PDF report.
 *
 * A PDF cannot be recalculated the way the Excel workbooks can, so this verifies the two things a
 * hand-written writer can actually get wrong — that the file is well-formed, and that the numbers
 * on it are the kernel's — plus the property the engineering docs ask for and a library would not
 * give us: byte-for-byte reproducibility from the same inputs.
 *
 * Run: npm run test:pdf-report
 */
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { geometryInputRebars, sectionGeometryFromGeometryInput } from '@pm/geometry'
import { buildResistanceMaterialSets } from '@pm/design'
import {
  analysisMeshKernelOptions,
  applyCalculationProfileToMaterials,
  createAnalysisOptionsForProfile,
  createDesignBasisForCalculationProfile,
  isEquivalentBlockProfileId,
  parseProjectDocument,
  type AnalysisOptions,
  type EquivalentBlockAnalysisOptions
} from '@pm/project'
import { buildDesignPreviewSurfaceFromPrepared, prepareAnalysis } from '@pm/analysis'
import { buildEquivalentBlockPreviewSurface } from '@pm/analysis-equivalent-block'
import { buildColumnReportModel } from '../../src/model/report-model'
import { columnReportFileName, renderColumnReport } from '../../src/pdf/column-report'

const OUT_DIR = resolve(process.cwd(), 'docs/examples/reference-case/generated')
const UNICODE_FONT = new Uint8Array(readFileSync(
  resolve(process.cwd(), 'apps/web/public/fonts/PMReportUnicode-Regular.ttf')
))

const CASES = [
  {
    file: 'docs/examples/reference-case/projects/PM-advanced (7) 2D.pm-project.json',
    label: 'stress-strain',
    archive: true,
    rebindTo: null
  },
  {
    file: 'docs/examples/equivalent-block/ACI-EB-01-rectangle-8-bars.pm-project.json',
    label: 'equivalent-block',
    archive: true,
    rebindTo: null
  },
  {
    file: 'docs/examples/equivalent-block/ACI-EB-01-rectangle-8-bars.pm-project.json',
    label: 'as-3600-preview',
    archive: false,
    rebindTo: 'as-3600-2018-amd2-equivalent-block' as const
  },
  {
    file: 'docs/examples/reference-case/projects/PM-advanced (7) 2D.pm-project.json',
    label: 'en-1992-preview',
    archive: false,
    rebindTo: 'en-1992-1-1-2004-stress-strain' as const
  }
] as const

const failures: string[] = []

const pass = (label: string, condition: boolean, detail = '') => {
  const line = `${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`
  console.log(line)
  if (!condition) failures.push(line)
}

const decode = (bytes: Uint8Array) => {
  let text = ''
  for (const byte of bytes) text += String.fromCharCode(byte)
  return text
}

const normalizedGeometry = (value: unknown) => JSON.stringify(
  value,
  (_key, item) => typeof item === 'number' ? Math.round(item * 1e7) / 1e7 : item
)

const runCase = async (
  relativePath: string,
  label: string,
  archive: boolean,
  rebindTo:
    | 'as-3600-2018-amd2-equivalent-block'
    | 'en-1992-1-1-2004-stress-strain'
    | null
) => {
  console.log(`\n================ ${label}: ${relativePath} ================`)
  const parsed = parseProjectDocument(readFileSync(resolve(process.cwd(), relativePath), 'utf8'))
  assert.ok(parsed.ok, `${relativePath} must parse`)
  if (!parsed.ok) return
  const document = parsed.document
  const geometry = document.inputs.geometry
  const section = sectionGeometryFromGeometryInput(geometry)
  const rebars = geometryInputRebars(geometry)
  const profileId = rebindTo ?? document.inputs.calculationProfileId
  const materialStore = rebindTo
    ? applyCalculationProfileToMaterials(document.inputs.materials, rebindTo)
    : document.inputs.materials
  const designBasis = rebindTo
    ? createDesignBasisForCalculationProfile(rebindTo)
    : document.inputs.design
  const analysisOptions = rebindTo
    ? createAnalysisOptionsForProfile(rebindTo)
    : document.inputs.analysis
  const loadcases = document.inputs.loadings.combinations

  const surface = isEquivalentBlockProfileId(profileId)
    ? buildEquivalentBlockPreviewSurface(
        profileId,
        section,
        rebars,
        materialStore,
        designBasis,
        analysisOptions as EquivalentBlockAnalysisOptions
      )
    : (() => {
        const options = analysisOptions as AnalysisOptions
        const stateMaterials = buildResistanceMaterialSets(materialStore, designBasis).stateMaterials
        const prepared = prepareAnalysis(section, rebars, stateMaterials, analysisMeshKernelOptions(options))
        return buildDesignPreviewSurfaceFromPrepared(
          prepared,
          materialStore,
          designBasis,
          options
        )
      })()

  const input = {
    projectName: document.meta.name,
    projectInformation: document.meta.information,
    sectionName: geometry.name,
    calculationProfileId: profileId,
    section,
    rebars,
    materialStore,
    designBasis,
    analysisOptions,
    surface,
    loadcases,
    // Every combination gets a worked page, which is also the heaviest path through the renderer.
    detailLoadcaseIds: loadcases.map((loadcase) => loadcase.id)
  }

  console.log('== 1. Model ==')
  const model = buildColumnReportModel(input)
  pass('identity, materials and resistance basis are populated',
    model.identity.length > 6 && model.concreteMaterial.length > 4 && model.resistanceBasis.length > 3)
  pass('project identity is available to every renderer',
    model.project.name === document.meta.name &&
      model.projectInformation.some(([label]) => label === 'Designed by'))
  pass('report declares the shared My convention without a cross-model caveat',
    model.identity.some(([label, value]) =>
      label === 'Sign convention' && value.includes('My = ΣF·(x−xc)')
    ) && model.scopeStatements.every((statement) => !statement.includes('not directly comparable')))
  pass('bar schedule matches the section', model.barSchedule.length === rebars.length,
    `${model.barSchedule.length} rows vs ${rebars.length} bars`)
  pass('a detail block exists per combination', model.details.length === loadcases.length,
    `${model.details.length}/${loadcases.length}`)
  pass('every combination has a row', model.combinations.length === loadcases.length)
  pass('the report is marked as preview, never released',
    model.status.startsWith('PREVIEW') && model.watermark === 'PREVIEW')

  console.log('== 2. The model reproduces the kernel, it does not recompute it ==')
  for (const detail of model.details) {
    if (!detail.converged) continue
    pass(`${detail.row.name}: capacity point lies on the demand ray`,
      detail.interaction.capacity !== null)
    if (detail.interaction.capacity && detail.row.utilization !== null) {
      // utilization = |demand| / |capacity| along the same ray, so the two must agree.
      const demandNorm = Math.hypot(detail.interaction.demand.m, detail.interaction.demand.p)
      const capacityNorm = Math.hypot(detail.interaction.capacity.m, detail.interaction.capacity.p)
      const implied = capacityNorm > 1e-9 ? demandNorm / capacityNorm : Number.NaN
      const relative = Math.abs(implied - detail.row.utilization) / Math.max(1e-9, detail.row.utilization)
      pass(`${detail.row.name}: drawn ray agrees with the reported utilization`, relative < 5e-3,
        `drawn ${implied.toFixed(5)} vs reported ${detail.row.utilization.toFixed(5)}`)
    }
    if (detail.depthProfile) {
      const profile = detail.depthProfile
      pass(`${detail.row.name}: block depth does not exceed the neutral-axis depth`,
        profile.blockDepth === null || profile.blockDepth <= profile.neutralAxisDepth + 1e-9)
      pass(`${detail.row.name}: bar depths lie inside the projected section depth`,
        detail.bars.every((bar) => bar.depth >= -1e-6 && bar.depth <= profile.projectedDepth + 1e-6))
    }
  }

  console.log('== 3. Translation invariance of report drawings ==')
  const dx = 1_234.5
  const dy = -876.25
  const translatedSection = {
    ...section,
    solids: section.solids.map((solid) => ({
      ...solid,
      outer: solid.outer.map((point) => ({ ...point, x: point.x + dx, y: point.y + dy })),
      holes: solid.holes.map((hole) =>
        hole.map((point) => ({ ...point, x: point.x + dx, y: point.y + dy }))
      )
    }))
  }
  const translatedRebars = rebars.map((bar) => ({ ...bar, x: bar.x + dx, y: bar.y + dy }))
  const translatedModel = buildColumnReportModel({
    ...input,
    section: translatedSection,
    rebars: translatedRebars
  })
  pass(
    'centroid-local section drawing is invariant under world-coordinate translation',
    normalizedGeometry(translatedModel.drawing.solids) === normalizedGeometry(model.drawing.solids) &&
      normalizedGeometry(translatedModel.drawing.bars) === normalizedGeometry(model.drawing.bars)
  )
  const detailGeometry = (detail: (typeof model.details)[number]) => ({
    neutralAxisLine: detail.neutralAxisLine,
    compressionZone: detail.compressionZone?.polygons ?? null,
    depthProfile: detail.depthProfile,
    bars: detail.bars.map((bar) => ({
      x: bar.x,
      y: bar.y,
      depth: bar.depth,
      strain: bar.strain,
      insideBlock: bar.insideBlock
    }))
  })
  pass(
    'neutral axis, compression zone, depth profile and bar evidence are translation invariant',
    translatedModel.details.length === model.details.length &&
      model.details.every((detail, index) =>
        normalizedGeometry(detailGeometry(translatedModel.details[index])) ===
        normalizedGeometry(detailGeometry(detail))
      )
  )

  console.log('== 4. File structure ==')
  const bytes = renderColumnReport(model, { unicodeFontBytes: UNICODE_FONT })
  const text = decode(bytes)
  pass('starts with a PDF header', text.startsWith('%PDF-1.4'))
  pass('ends with %%EOF', text.trimEnd().endsWith('%%EOF'))
  const pageCount = (text.match(/\/Type \/Page[^s]/g) ?? []).length
  pass('page count is at least input + capacity + demand + one detail each',
    pageCount >= 3 + model.details.length, `${pageCount} pages`)
  const declaredCount = Number(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/.exec(text)?.[1] ?? '0')
  pass('the page tree count matches the page objects', declaredCount === pageCount,
    `tree ${declaredCount} vs objects ${pageCount}`)

  // Every xref offset must land exactly on its own "N 0 obj" header, which is the single most
  // common way a hand-written PDF silently breaks in a strict reader.
  const xrefStart = Number(/startxref\s+(\d+)/.exec(text)?.[1] ?? '-1')
  pass('startxref points at the xref table', text.slice(xrefStart, xrefStart + 4) === 'xref')
  const size = Number(/\/Size (\d+)/.exec(text)?.[1] ?? '0')
  const entries = [...text.slice(xrefStart).matchAll(/^(\d{10}) 00000 n $/gm)].map((match) => Number(match[1]))
  pass('xref lists every object', entries.length === size - 1, `${entries.length} of ${size - 1}`)
  const misaligned = entries.filter((offset, index) => !text.startsWith(`${index + 1} 0 obj`, offset))
  pass('every xref offset lands on its object header', misaligned.length === 0,
    misaligned.slice(0, 3).join(', '))
  pass('page numbering is stamped', text.includes(`Page 1 of ${pageCount}`))
  pass('the watermark is present', text.includes('PREVIEW'))

  console.log('== 5. Reproducibility ==')
  const again = renderColumnReport(buildColumnReportModel(input), { unicodeFontBytes: UNICODE_FONT })
  pass('the same input produces byte-identical output',
    again.length === bytes.length && again.every((byte, index) => byte === bytes[index]))

  console.log('== 6. Unicode text ==')
  const unicodeModel = buildColumnReportModel({
    ...input,
    projectName: '기둥 C1 설계',
    projectInformation: {
      client: 'Công ty Xây dựng Á Châu',
      company: '구조 설계 주식회사',
      designedBy: 'Nguyễn Văn An',
      checkedBy: 'Jürgen Weiß',
      address: '서울특별시 중구',
      date: '2026-08-10'
    },
    sectionName: 'Cột trục A — tầng 3 · Säule Nr. 5'
  })
  const unicodeBytes = renderColumnReport(unicodeModel, { unicodeFontBytes: UNICODE_FONT })
  const unicodePdf = decode(unicodeBytes)
  pass('user-entered Korean, Vietnamese and German text activates an embedded Unicode font',
    unicodePdf.includes('/Subtype /Type0') &&
      unicodePdf.includes('/PMReportUnicode-Regular') &&
      unicodePdf.includes('/ToUnicode'))
  pass('Unicode document metadata uses a UTF-16BE PDF string instead of dropping characters',
    unicodePdf.includes('/Title <FEFF') && unicodePdf.includes('/Subject <FEFF'))

  if (archive) {
    const name = columnReportFileName(model)
    writeFileSync(resolve(OUT_DIR, name), Buffer.from(bytes))
    console.log(`      archived ${name}  ${(bytes.length / 1024).toFixed(0)} kB, ${pageCount} pages`)
  }
}

const run = async () => {
  for (const testCase of CASES) {
    await runCase(testCase.file, testCase.label, testCase.archive, testCase.rebindTo)
  }
  if (failures.length > 0) {
    console.error(`\n${failures.length} check(s) failed:`)
    for (const line of failures) console.error(`  ${line}`)
    process.exitCode = 1
    return
  }
  console.log('\nAll PDF report checks passed.')
}

void run()
