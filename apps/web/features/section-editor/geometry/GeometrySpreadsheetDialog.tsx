'use client'
import { useState } from 'react'
import type { GeometryInputRebarView, Point2 } from '@pm/geometry'
import type { UnitContext } from '@pm/units'
import { buildCoordinateWorkbook, prepareCoordinateSheet, coordinatesFromSheet, buildRebarTableWorkbook,
  prepareRebarTableSheet, rebarsFromSheet, type CoordinateTarget, type RebarTarget } from '@pm/spreadsheet/geometry'
import { SpreadsheetDialog } from '../shared/SpreadsheetDialog'

export function CoordinateSpreadsheetDialog({ target, revision, units, locked, onUpdate, onClose }: {
  target: CoordinateTarget; revision: unknown; units: UnitContext; locked: boolean
  onUpdate(points: Point2[]): unknown; onClose(): void
}) {
  const [adapter] = useState(() => ({
    title: 'Coordinates', frameTitle: 'Coordinate spreadsheet', fileName: 'coordinates.xlsx',
    create: async () => prepareCoordinateSheet((await buildCoordinateWorkbook(target.outers[target.outerIndex]?.[target.ringIndex] ?? [], units)).slice().buffer, target),
    open: (bytes: ArrayBuffer) => prepareCoordinateSheet(bytes, target), read: coordinatesFromSheet,
    caption: () => target.ringIndex === 0 ? `Outer ${target.outerIndex + 1}` : `Outer ${target.outerIndex + 1} · Hole ${target.ringIndex}`
  }))
  return <SpreadsheetDialog adapter={adapter} target={revision} updateDisabled={locked} onUpdate={onUpdate} onClose={onClose} />
}

export function RebarSpreadsheetDialog({ target, revision, units, onUpdate, onClose }: {
  target: RebarTarget; revision: unknown; units: UnitContext
  onUpdate(bars: GeometryInputRebarView[]): unknown; onClose(): void
}) {
  const [adapter] = useState(() => ({
    title: 'Rebars', frameTitle: 'Rebar spreadsheet', fileName: 'rebars.xlsx',
    create: async () => prepareRebarTableSheet((await buildRebarTableWorkbook(target, units)).slice().buffer, target),
    open: (bytes: ArrayBuffer) => prepareRebarTableSheet(bytes, target), read: rebarsFromSheet
  }))
  return <SpreadsheetDialog adapter={adapter} target={revision} onUpdate={onUpdate} onClose={onClose} />
}
