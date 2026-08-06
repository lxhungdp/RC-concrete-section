/** Stable identifier persisted by both analysis pipelines for the shared station schedule. */
export const UNIFIED_STATION_SCHEDULE = 'unified-22-v1' as const

/** Neutral axis outside or on the section, ordered from pure compression toward the section. */
export const UNIFIED_DEPTH_RATIOS = [3, 2, 1.5, 1.2, 1.1, 1] as const

/**
 * Tensile strain magnitude of the controlling bar, normalized by that bar's own yield strain.
 * The list is ordered from zero tension toward the code-defined pure-tension pole.
 */
export const UNIFIED_STEEL_STRAIN_YIELD_RATIOS = [
  0, 0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10, 20
] as const

export const UNIFIED_INTERMEDIATE_STATION_COUNT =
  UNIFIED_DEPTH_RATIOS.length + UNIFIED_STEEL_STRAIN_YIELD_RATIOS.length

/** The two exact uniform-strain poles bracket all intermediate states. */
export const UNIFIED_STATION_COUNT = UNIFIED_INTERMEDIATE_STATION_COUNT + 2

if (UNIFIED_STATION_COUNT !== 22) {
  throw new Error('The unified station schedule must contain exactly 22 stations.')
}
