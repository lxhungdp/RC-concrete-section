import { UNIT_PRESETS, type UnitContext } from '@pm/units'
import { CENTROID_LOAD_REFERENCE, type LoadCombination, type LoadReference } from '@pm/project'
import { buildLoadcaseWorkbook, loadcaseWorkbookFileName } from '@pm/spreadsheet/loadcase-xlsx'
export * from '@pm/spreadsheet/loadcase-xlsx'

export const downloadLoadcaseWorkbook = async (loadcases: LoadCombination[], units: UnitContext = UNIT_PRESETS.metric, reference: LoadReference = CENTROID_LOAD_REFERENCE) => {
  const bytes = await buildLoadcaseWorkbook(loadcases, units, reference)
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const blob = new Blob([copy.buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = loadcaseWorkbookFileName
  anchor.click()
  URL.revokeObjectURL(url)
}
