'use client'
import { useState } from 'react'
import { loadReferenceOf, type LoadCombination, type LoadingsInput } from '@pm/project'
import type { UnitContext } from '@pm/units'
import { buildLoadcaseWorkbook } from '@pm/spreadsheet/loadcase-xlsx'
import { prepareLoadcaseSheet, loadcasesFromSheet, loadcaseSheetReferenceLabel } from '@pm/spreadsheet/loadcases'
import { SpreadsheetDialog } from '../shared/SpreadsheetDialog'

export function LoadcaseSpreadsheetDialog({ input, units, onUpdate, onClose }: {
  input: LoadingsInput; units: UnitContext; onUpdate(loadcases: LoadCombination[]): LoadingsInput; onClose(): void
}) {
  const [adapter] = useState(() => ({
    title: 'Loadcases', frameTitle: 'Loadcase spreadsheet', fileName: 'loadcases.xlsx',
    create: async () => prepareLoadcaseSheet((await buildLoadcaseWorkbook(input.combinations, units, loadReferenceOf(input))).slice().buffer, input.combinations),
    open: (bytes: ArrayBuffer) => prepareLoadcaseSheet(bytes),
    read: loadcasesFromSheet, caption: loadcaseSheetReferenceLabel
  }))
  return <SpreadsheetDialog adapter={adapter} target={input} onUpdate={onUpdate} onClose={onClose} />
}
