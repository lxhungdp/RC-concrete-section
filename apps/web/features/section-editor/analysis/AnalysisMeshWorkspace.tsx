'use client'

import { useEffect, useState } from 'react'
import { FileDown, FileSpreadsheet, Loader2, RotateCw } from 'lucide-react'
import type { GeometryInputRebarView, SectionGeometry } from '@pm/geometry'
import type { MaterialStore } from '@pm/materials'
import type { AnalysisOptions } from '@pm/project'
import { meshAuditFileName } from '@pm/report'
import {
  buildSectionMeshAsync,
  exportMeshAuditDxfAsync,
  exportMeshAuditWorkbookAsync,
  isAnalysisAbort
} from '../../../application/analysis/client'
import type { SectionMeshView } from '../../../application/analysis/section-mesh-view'
import { SectionMeshChart } from '../results/SectionMeshChart'

type Props = {
  theme: 'light' | 'dark'
  projectName: string
  ready: boolean
  section: SectionGeometry
  rebars: GeometryInputRebarView[]
  materialStore: MaterialStore
  analysisOptions: AnalysisOptions
}

const fmt = (value: number, digits = 3) =>
  Math.abs(value) < 1e-12 ? '0' : value.toLocaleString('en-US', { maximumFractionDigits: digits })

const sci = (value: number, digits = 2) => {
  if (!Number.isFinite(value) || Math.abs(value) < 1e-16) return '0'
  return value.toExponential(digits)
}

export function AnalysisMeshWorkspace({
  theme,
  projectName,
  ready,
  section,
  rebars,
  materialStore,
  analysisOptions
}: Props) {
  const [mesh, setMesh] = useState<SectionMeshView | null>(null)
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')
  const [showQuadraturePoints, setShowQuadraturePoints] = useState(false)
  const [showRebars, setShowRebars] = useState(true)
  const [exporting, setExporting] = useState<'excel' | 'dxf' | null>(null)
  const [exportMessage, setExportMessage] = useState('')
  const [exportError, setExportError] = useState(false)

  useEffect(() => {
    setMesh(null)
    setMessage('')

    if (!ready) {
      setWorking(false)
      return
    }

    const controller = new AbortController()
    setWorking(true)
    buildSectionMeshAsync({ section, rebars, materialStore, analysisOptions }, controller.signal)
      .then((nextMesh) => {
        setMesh(nextMesh)
        setWorking(false)
      })
      .catch((error) => {
        if (isAnalysisAbort(error)) return
        setWorking(false)
        setMessage(error instanceof Error ? error.message : String(error))
      })

    return () => controller.abort()
  }, [analysisOptions, materialStore, ready, rebars, section])

  const downloadMesh = async (format: 'excel' | 'dxf') => {
    if (!mesh || exporting) return
    setExporting(format)
    setExportMessage('')
    setExportError(false)
    const payload = {
      projectName,
      sectionName: section.name,
      section,
      rebars,
      materialStore,
      analysisOptions
    }
    try {
      const blob =
        format === 'excel'
          ? await exportMeshAuditWorkbookAsync(payload)
          : await exportMeshAuditDxfAsync(payload)
      const extension = format === 'excel' ? 'xlsx' : 'dxf'
      const fileName = meshAuditFileName(payload, extension)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = fileName
      anchor.click()
      URL.revokeObjectURL(url)
      setExportMessage(`Saved ${fileName}`)
    } catch (error) {
      setExportError(true)
      setExportMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setExporting(null)
    }
  }

  if (!ready) {
    return (
      <section className="pm-results-empty">
        <RotateCw size={28} />
        <h2>Apply geometry and reinforcement first</h2>
        <p>The analysis mesh needs an applied section before it can be generated.</p>
      </section>
    )
  }

  return (
    <section className="pm-analysis-mesh-stage" aria-label="Analysis section mesh">
      <article className="pm-results-plot pm-analysis-mesh-card">
        <div className="pm-results-plot-title">
          <div className="pm-results-plot-heading">
            <span>Section mesh</span>
            <strong>
              {mesh
                ? `${mesh.report.cells.toLocaleString('en-US')} cells · ${mesh.report.triangles.toLocaleString('en-US')} triangles`
                : working
                  ? 'Generating exact integration mesh…'
                  : 'Mesh unavailable'}
            </strong>
          </div>
          <div className="pm-section-field-toolbar" role="group" aria-label="Section mesh options">
            <button
              type="button"
              className="pm-mesh-export-button"
              disabled={!mesh || exporting !== null}
              onClick={() => downloadMesh('excel')}
              title="Download the complete mesh audit workbook"
            >
              {exporting === 'excel'
                ? <Loader2 size={13} className="pm-spin" />
                : <FileSpreadsheet size={13} />}
              Excel
            </button>
            <button
              type="button"
              className="pm-mesh-export-button"
              disabled={!mesh || exporting !== null}
              onClick={() => downloadMesh('dxf')}
              title="Download all mesh triangles, quadrature points, boundaries and rebars as DXF"
            >
              {exporting === 'dxf'
                ? <Loader2 size={13} className="pm-spin" />
                : <FileDown size={13} />}
              DXF
            </button>
            <label className={`pm-field-check${showQuadraturePoints ? ' is-on' : ''}`}>
              <input
                type="checkbox"
                checked={showQuadraturePoints}
                onChange={(event) => setShowQuadraturePoints(event.target.checked)}
              />
              Gauss pts
            </label>
            <label className={`pm-field-check${showRebars ? ' is-on' : ''}`}>
              <input
                type="checkbox"
                checked={showRebars}
                onChange={(event) => setShowRebars(event.target.checked)}
              />
              Rebar
            </label>
          </div>
        </div>
        <div className="pm-results-plot-body">
          <div className="pm-results-plot-canvas">
            {mesh ? (
              <SectionMeshChart
                theme={theme}
                mesh={mesh}
                section={section}
                rebars={rebars}
                showQuadraturePoints={showQuadraturePoints}
                showRebars={showRebars}
              />
            ) : (
              <div className="pm-results-plot-placeholder">
                {working ? (
                  <span className="pm-analysis-mesh-loading">
                    <Loader2 size={18} className="pm-spin" />
                    Generating exact integration mesh…
                  </span>
                ) : (
                  message || 'The mesh could not be generated.'
                )}
              </div>
            )}
          </div>
          {mesh ? (
            <div className="pm-section-mesh-quality">
              <span>h = {fmt(mesh.report.cellSize, 3)} mm</span>
              <span>{mesh.report.points.toLocaleString('en-US')} integration points</span>
              <span>area error = {sci(mesh.report.areaError, 2)} mm²</span>
              <strong className={mesh.report.ok ? 'is-ok' : 'is-bad'}>
                {mesh.report.ok ? 'Verified' : 'Check mesh'}
              </strong>
              {exportMessage ? (
                <span className={exportError ? 'is-bad' : ''} role="status">
                  {exportMessage}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </article>
    </section>
  )
}
