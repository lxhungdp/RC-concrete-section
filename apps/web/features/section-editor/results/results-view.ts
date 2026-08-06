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
export type DemandChartId = 'heatmap' | 'fixedP' | 'vertical'
export type SurfaceResistanceMode = 'nominal' | 'design'
export type FieldMode = 'strain' | 'stress'

export type SectionResultsView = {
  /** Fixed direct-meridian strain-gradient direction, degrees. */
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
  id === 'vertical' ? 'Vertical meridian' : id === 'surface3d' ? '3D P-Mx-My' : 'Fixed-P Mx-My'

export const demandChartLabel = (id: DemandChartId) =>
  id === 'heatmap' ? 'Section field' : id === 'fixedP' ? 'Fixed-P Mx-My' : 'Vertical meridian'

/**
 * Slider ceiling and step for the fixed direct-meridian angle.
 *
 * The full-circle slider runs 0°…360° so the last stop matches a complete turn (same direction as
 * 0°). Drawing the opposite half-plane already covers 180°–360°, so that mode caps at 180°.
 */
export const roundDirectionAngleDeg = (degrees: number) => {
  const wrapped = ((degrees % 360) + 360) % 360
  return Math.round(wrapped * 1000) / 1000
}

/** Unique β angles on the resistance surface, in degrees, sorted ascending in [0, 360). */
export const uniqueSurfaceDirectionAnglesDeg = (betasRad: readonly number[]): number[] => {
  const angles = new Set<number>()
  for (const beta of betasRad) {
    angles.add(roundDirectionAngleDeg((beta * 180) / Math.PI))
  }
  return [...angles].sort((a, b) => a - b)
}

/**
 * Dominant angular spacing of a closed direction ring.
 *
 * Adaptive refinement inserts tighter gaps; the seed spacing remains the most common gap and is
 * what the Angle slider should step by. Falls back to 10° (the 36-direction production seed).
 */
export const directionAngleStepDeg = (anglesDeg: readonly number[], fallback = 10) => {
  if (anglesDeg.length < 2) return fallback
  const gaps: number[] = []
  for (let i = 1; i < anglesDeg.length; i++) gaps.push(anglesDeg[i]! - anglesDeg[i - 1]!)
  gaps.push(360 - anglesDeg[anglesDeg.length - 1]! + anglesDeg[0]!)
  const rounded = gaps
    .filter((gap) => gap > 1e-6)
    .map((gap) => Math.round(gap * 1000) / 1000)
  if (rounded.length === 0) return fallback
  const freq = new Map<number, number>()
  for (const gap of rounded) freq.set(gap, (freq.get(gap) ?? 0) + 1)
  let bestGap = rounded[0]!
  let bestCount = 0
  for (const [gap, count] of freq) {
    // Prefer the most frequent gap; on a tie keep the larger (seed) spacing.
    if (count > bestCount || (count === bestCount && gap > bestGap)) {
      bestGap = gap
      bestCount = count
    }
  }
  return bestGap > 0 ? bestGap : fallback
}

export const sliceAngleMax = (
  view: Pick<SectionResultsView, 'includeOppositeMoment'>,
  _anglesDeg: readonly number[] = [],
  _stepDeg = 10
) => (view.includeOppositeMoment ? 180 : 360)

/** Snap a typed/dragged angle onto a solved direction that still lies inside the slider range. */
export const snapSliceAngleDeg = (
  value: number,
  anglesDeg: readonly number[],
  maxDeg: number,
  stepDeg: number
) => {
  const clamped = Math.min(maxDeg, Math.max(0, value))
  // 360° is the same physical direction as 0°; keep it selectable at the end of the slider.
  const candidates = anglesDeg
    .filter((angle) => angle <= maxDeg + 1e-6)
    .concat(maxDeg >= 360 - 1e-9 ? [360] : [])
  if (candidates.length === 0) {
    const snapped = Math.round(clamped / stepDeg) * stepDeg
    return Math.min(maxDeg, Math.max(0, snapped))
  }
  let best = candidates[0]!
  let bestDist = Math.abs(best - clamped)
  for (const angle of candidates) {
    const dist = Math.abs(angle - clamped)
    if (dist < bestDist) {
      best = angle
      bestDist = dist
    }
  }
  return best
}

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
