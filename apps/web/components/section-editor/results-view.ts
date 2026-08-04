/**
 * Presentation state shared by the Section Results sidebar and its charts.
 *
 * The controls live in the sidebar and the plots live in the stage, so neither can own this state.
 * Keeping it as one object — rather than nine lifted `useState` pairs — means adding a control is a
 * field here plus a row in the panel, and the workspace keeps a single `view` prop.
 *
 * It is view state only: nothing here changes a resultant. Anything that does belongs in
 * `AnalysisOptions` or `DesignBasis`, per `docs/01-control-map.md`.
 */
export type SectionChartId = 'vertical' | 'surface3d' | 'fixedP'
export type DemandChartId = 'heatmap' | 'fixedP' | 'vertical'
export type SurfaceResistanceMode = 'nominal' | 'design'
export type FieldMode = 'strain' | 'stress'

export type SectionResultsView = {
  /** Vertical-slice plane angle, degrees. */
  sliceAngle: number
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
  primaryChart: DemandChartId
  visibleCharts: Record<DemandChartId, boolean>
}

export const SECTION_CHART_IDS: readonly SectionChartId[] = ['vertical', 'surface3d', 'fixedP']
export const DEMAND_CHART_IDS: readonly DemandChartId[] = ['heatmap', 'fixedP', 'vertical']

export const sectionChartLabel = (id: SectionChartId) =>
  id === 'vertical' ? 'Vertical slice' : id === 'surface3d' ? '3D P-Mx-My' : 'Fixed-P Mx-My'

export const demandChartLabel = (id: DemandChartId) =>
  id === 'heatmap' ? 'Section field' : id === 'fixedP' ? 'Fixed-P Mx-My' : 'Vertical slice'

/**
 * Slider ceiling for the vertical-slice angle.
 *
 * Drawing the opposite half-plane already covers 180°-360°, so the usable range halves. The
 * sidebar renders the slider and the workspace clamps the stored value, so the rule has to have one
 * owner or the two disagree at the boundary.
 */
export const sliceAngleMax = (view: Pick<SectionResultsView, 'includeOppositeMoment'>) =>
  view.includeOppositeMoment ? 180 : 345

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
  primaryChart: 'heatmap',
  visibleCharts: { heatmap: true, fixedP: true, vertical: true }
})

/**
 * Hiding the last visible chart would leave an empty stage, and hiding the primary one would leave
 * the layout without an anchor. Both rules live here so the sidebar and any future caller agree.
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
