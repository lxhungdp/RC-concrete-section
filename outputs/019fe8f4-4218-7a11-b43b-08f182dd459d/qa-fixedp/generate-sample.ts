import { writeFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { activeDesignSurfaceDataset, buildDesignPreviewSurface } from '@pm/analysis'
import { geometryInputRebars, sectionGeometryFromGeometryInput } from '@pm/geometry'
import {
  analysisMeshKernelOptions,
  createDefaultAnalysisOptions,
  parseProjectDocument
} from '@pm/project'
import { buildChartAuditWorkbookBytes } from '@pm/report'

const main = async () => {
  const root = process.cwd()
  const parsed = parseProjectDocument(readFileSync(
    resolve(root, 'docs/examples/reference-case/projects/PM-advanced (7) 2D.pm-project.json'),
    'utf8'
  ))
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'))
  const document = parsed.document
  const section = sectionGeometryFromGeometryInput(document.inputs.geometry)
  const rebars = geometryInputRebars(document.inputs.geometry)
  const options = createDefaultAnalysisOptions()
  options.mesh.sizing = { type: 'automatic', seedDivisions: 8 }
  options.stations.refinement = { type: 'fixed' }
  options.directions.refinement = { type: 'fixed', probe: 'all' }
  const surface = buildDesignPreviewSurface(
    section,
    rebars,
    document.inputs.materials,
    document.inputs.design,
    analysisMeshKernelOptions(options),
    options
  )
  const dataset = activeDesignSurfaceDataset(surface)
  const fixedP = Math.max(...dataset.points.map((point) => point.P))
  const bytes = await buildChartAuditWorkbookBytes({
    projectName: document.meta.name,
    projectInformation: document.meta.information,
    sectionName: section.name,
    section,
    rebars,
    materialStore: document.inputs.materials,
    designBasis: document.inputs.design,
    surface,
    source: 'fixedP',
    resistanceStage: 'design',
    sliceAngleDeg: 15,
    fixedP,
    loadcases: document.inputs.loadings.combinations
  })
  writeFileSync(
    resolve(root, 'outputs/019fe8f4-4218-7a11-b43b-08f182dd459d/fixed-p-chart-audit-sample.xlsx'),
    bytes
  )
}

void main()
