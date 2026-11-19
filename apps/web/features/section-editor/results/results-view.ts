/**
 * Presentation state for Section Results / Demand Check charts.
 *
 * Chart parameters live on the plot headers; this object is the shared view state so the stage can
 * own the controls without lifting nine separate `useState` pairs.
 *
 * It is view state only: nothing here changes a resultant. Anything that does belongs in
 * `AnalysisOptions` or `DesignBasis`, per `docs/01-control-map.md`.
 */
export type SectionChartId = 'vertical' | 'surface3d' | 'fixedP'
export type SurfaceResistanceMode = 'nominal' | 'design'
export type FieldMode = 'strain' | 'stress'

export type SectionResultsView = {
  /** Capacity P–M at θ: the moment direction θ = atan2(My, Mx) in Mx–My, degrees (never a strain angle). */
  sliceAngle: number
  /** Also draw θ + 180° at negative Mθ, the other half of the same vertical plane. */
  includeOppositeMoment: boolean
  showDesignResistance: boolean
  showNominalReference: boolean
  surfaceResistanceMode: SurfaceResistanceMode
  showSceneAxes: boolean
  showFixedPAngleRays: boolean
  primaryChart: SectionChartId
  visibleCharts: Record<SectionChartId, boolean>
}

export type DemandCheckView = {
  fieldMode: FieldMode
  showNeutralAxis: boolean
  showMoments: boolean
  includeRebar: boolean
  /** Session layout of the 2 × 2 chart grid; never a project or engineering input. */
  gridSplit: DemandGridSplit
}

/** Fractions of the grid track space given to the first column (x) and the first row (y). */
export type DemandGridSplit = { x: number; y: number }
export const DEMAND_GRID_SPLIT_DEFAULT: DemandGridSplit = { x: 0.5, y: 0.5 }
export const DEMAND_GRID_SPLIT_LIMITS = { min: 0.25, max: 0.75, step: 0.02, largeStep: 0.08 } as const

const clampSplit = (value: number) => Number.isFinite(value)
  ? Math.min(DEMAND_GRID_SPLIT_LIMITS.max, Math.max(DEMAND_GRID_SPLIT_LIMITS.min, value))
  : 0.5
export const clampDemandGridSplit = (split: DemandGridSplit): DemandGridSplit => ({ x: clampSplit(split.x), y: clampSplit(split.y) })

/** Keyboard resize of the centre handle: arrows move 2% (Shift 8%), Home resets; other keys return null. */
export const demandGridKeyboardSplit = (key: string, shift: boolean, split: DemandGridSplit): DemandGridSplit | null => {
  const step = shift ? DEMAND_GRID_SPLIT_LIMITS.largeStep : DEMAND_GRID_SPLIT_LIMITS.step
  if (key === 'Home') return { ...DEMAND_GRID_SPLIT_DEFAULT }
  if (key === 'ArrowLeft') return clampDemandGridSplit({ ...split, x: split.x - step })
  if (key === 'ArrowRight') return clampDemandGridSplit({ ...split, x: split.x + step })
  if (key === 'ArrowUp') return clampDemandGridSplit({ ...split, y: split.y - step })
  if (key === 'ArrowDown') return clampDemandGridSplit({ ...split, y: split.y + step })
  return null
}

/** Pointer position inside the grid box to a split, excluding the pane gap from the track space. */
export const demandGridPointerSplit = (
  point: { x: number; y: number },
  box: { left: number; top: number; width: number; height: number },
  gap: number
): DemandGridSplit => clampDemandGridSplit({
  x: (point.x - box.left - gap / 2) / Math.max(1, box.width - gap),
  y: (point.y - box.top - gap / 2) / Math.max(1, box.height - gap)
})

export const SECTION_CHART_IDS: readonly SectionChartId[] = ['vertical', 'surface3d', 'fixedP']

export const sectionChartLabel = (id: SectionChartId) =>
  id === 'vertical' ? 'P–M at θ' : id === 'surface3d' ? '3D P-Mx-My' : 'Fixed-P Mx-My'

export const createSectionResultsView = (): SectionResultsView => ({
  sliceAngle: 0,
  includeOppositeMoment: false,
  showDesignResistance: true,
  showNominalReference: true,
  surfaceResistanceMode: 'design',
  showSceneAxes: false,
  showFixedPAngleRays: false,
  primaryChart: 'vertical',
  visibleCharts: { vertical: true, surface3d: true, fixedP: true }
})

export const createDemandCheckView = (): DemandCheckView => ({
  fieldMode: 'strain',
  showNeutralAxis: true,
  showMoments: true,
  includeRebar: false,
  gridSplit: { ...DEMAND_GRID_SPLIT_DEFAULT }
})

/**
 * Hiding the last visible chart would leave an empty stage, and hiding the primary one would leave
 * the layout without an anchor. Both rules live here so every chart-header toggle agrees.
 */
export const toggleChartVisibility = <TId extends string>(
  view: { primaryChart: TId; visibleCharts: Record<TId, boolean> },
  ids: readonly TId[],
  id: TId
): Partial<{ primaryChart: TId; visibleCharts: Record<TId, boolean> }> => {
  const visibleCharts = { ...view.visibleCharts, [id]: !view.visibleCharts[id] }
  if (ids.every((candidate) => !visibleCharts[candidate])) return {}
  if (!visibleCharts[view.primaryChart]) {
    const next = ids.find((candidate) => visibleCharts[candidate])
    return next ? { visibleCharts, primaryChart: next } : {}
  }
  return { visibleCharts }
}
