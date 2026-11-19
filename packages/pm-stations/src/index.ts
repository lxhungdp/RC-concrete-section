/** Stable identifier persisted by both analysis pipelines for the shared station schedule. */
export const UNIFIED_STATION_SCHEDULE = 'unified-27-v2' as const

/** Sparse physical seed used only by the fully-adaptive sampling mode. */
export const ADAPTIVE_STATION_SCHEDULE = 'adaptive-seed-12-v1' as const

/** Canonical identifiers accepted only for migration to {@link UNIFIED_STATION_SCHEDULE}. */
export const LEGACY_UNIFIED_STATION_SCHEDULES = [
  'unified-22-v1',
  'transition-aware-p0-p24-v1'
] as const

/** Neutral axis outside or on the section, ordered from pure compression toward the section. */
export const UNIFIED_DEPTH_RATIOS = [3, 2, 1.5, 1.2, 1.1, 1] as const

/**
 * Tensile strain magnitude of the controlling bar, normalized by that bar's own yield strain.
 * The list is ordered from zero tension toward the code-defined pure-tension pole.
 */
export const UNIFIED_STEEL_STRAIN_YIELD_RATIOS = [
  0, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5, 7.5, 10, 20
] as const

/**
 * The adaptive solver deliberately starts much coarser than the production fixed grid.  These
 * values are engineering landmarks, not a reduced fixed surface: every meridian may insert its
 * own additional states after evaluating its local chord error.
 */
export const ADAPTIVE_DEPTH_RATIOS = [2, 1] as const
export const ADAPTIVE_STEEL_STRAIN_YIELD_RATIOS = [
  0, 0.25, 0.5, 0.75, 1, 1.5, 2, 4, 10, 20
] as const

export const ADAPTIVE_INTERMEDIATE_STATION_COUNT =
  ADAPTIVE_DEPTH_RATIOS.length + ADAPTIVE_STEEL_STRAIN_YIELD_RATIOS.length
export const ADAPTIVE_INITIAL_STATION_COUNT = ADAPTIVE_INTERMEDIATE_STATION_COUNT + 2

if (ADAPTIVE_INTERMEDIATE_STATION_COUNT !== 12 || ADAPTIVE_INITIAL_STATION_COUNT !== 14) {
  throw new Error('The adaptive schedule must contain 12 seeds plus two exact poles.')
}

export const UNIFIED_INTERMEDIATE_STATION_COUNT =
  UNIFIED_DEPTH_RATIOS.length + UNIFIED_STEEL_STRAIN_YIELD_RATIOS.length

/** The two exact uniform-strain poles bracket all intermediate states. */
export const UNIFIED_STATION_COUNT = UNIFIED_INTERMEDIATE_STATION_COUNT + 2

if (UNIFIED_STATION_COUNT !== 27) {
  throw new Error('The unified station schedule must contain exactly 27 stations.')
}
