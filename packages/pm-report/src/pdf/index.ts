/**
 * PDF entry point, deliberately not re-exported from the package index.
 *
 * The analysis worker imports `@pm/report` for the Excel writers; keeping the PDF renderer on its
 * own subpath means the worker bundle never pulls the drawing code, and the web app can load it as
 * its own chunk when the user actually asks for a report.
 */
export { columnReportFileName, renderColumnReport } from './column-report'
export { A4_LANDSCAPE, A4_PORTRAIT } from './writer'

import { buildColumnReportModel, type ReportInput } from '../report-model'
import { columnReportFileName, renderColumnReport } from './column-report'

export const buildColumnReportPdf = (input: ReportInput) => {
  const model = buildColumnReportModel(input)
  const bytes = renderColumnReport(model)
  return { model, bytes, fileName: columnReportFileName(model) }
}

export const exportColumnReportPdf = (input: ReportInput) => {
  const { bytes, fileName } = buildColumnReportPdf(input)
  return {
    fileName,
    blob: new Blob([bytes as unknown as ArrayBuffer], { type: 'application/pdf' })
  }
}
