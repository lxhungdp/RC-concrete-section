import {
  UNIFIED_DEPTH_RATIOS,
  UNIFIED_STATION_SCHEDULE,
  UNIFIED_STEEL_STRAIN_YIELD_RATIOS
} from '@pm/stations'

/**
 * Serializable analysis configuration.
 *
 * This package owns the persisted DTO only. Geometry/material-aware normalization and engineering
 * validation live in `@pm/analysis`; React and worker code must pass this object through unchanged.
 */
export const ANALYSIS_OPTIONS_VERSION = 1 as const
export const STRAIN_DOMAIN_SURFACE_METHOD = 'strain-domain-surface-v1' as const
export const EQUIVALENT_BLOCK_SURFACE_METHOD = 'equivalent-block-surface-v1' as const

export const MAX_INTERMEDIATE_STATIONS = 198
export const MAX_STATION_LABEL_LENGTH = 120
export const MAX_SEED_DIRECTIONS = 360
export const MAX_REFINED_DIRECTIONS = 720
export const MAX_MESH_SEED_DIVISIONS = 256
export const MAX_MESH_CELLS = 1_000_000
export const MAX_MESH_SUBDIVISION = 8
export const MAX_BLOCK_STATIONS = 198

/** Production sampling policy shared by both mechanics. */
export const FIXED_DIRECTION_COUNT = 36
export const ADAPTIVE_INTERPOLATION_TOLERANCE = 0.0075
// Eight is a ceiling, not a prescribed pass count. Production benchmarks include a dense tall
// rectangle that converges on station pass seven while remaining below the 48-station cap.
export const ADAPTIVE_MAX_PASSES = 8
export const ADAPTIVE_MAX_STATIONS = 48
export const ADAPTIVE_MAX_DIRECTIONS = 360

export type AnalysisStationCriterion =
  | { type: 'c-over-c1'; ratio: number }
  | { type: 'depth-ratio'; ratio: number }
  | { type: 'steel-stress-ratio'; ratio: number }
  | { type: 'steel-strain'; strain: number }
  | { type: 'bar-tension-yield-ratio'; ratio: number }
  /** Fraction from eps_y to the code-defined tension-controlled strain limit. */
  | { type: 'strength-reduction-transition-ratio'; ratio: number }
  /**
   * @deprecated Prefer `steel-strain` with the absolute controlling-bar strain.
   * Kept for reading older projects; the parser rewrites it to `steel-strain`.
   */
  | { type: 'strength-reduction-post-transition'; strain: number }

export type AnalysisStation = {
  /** Stable within the station schedule; display order is the array order. */
  id: number
  label: string
  criterion: AnalysisStationCriterion
}

export type DirectionSeed =
  | { type: 'uniform'; count: number; startDeg: number }
  | { type: 'explicit'; anglesDeg: number[] }

export type DirectionProbe = 'all' | { stationIds: number[] }

export type DirectionRefinement =
  | { type: 'fixed'; probe: DirectionProbe }
  | {
      type: 'adaptive'
      tolerance: number
      maxPasses: number
      maxDirections: number
      probe: DirectionProbe
    }

/** Refinement policy for the compression-to-tension station curve, including both exact poles. */
export type StationRefinement =
  | { type: 'fixed' }
  | { type: 'adaptive'; tolerance: number; maxPasses: number; maxStations: number }

export type AnalysisMeshOptions = {
  sizing:
    | { type: 'automatic'; seedDivisions: number }
    | { type: 'fixed'; cellSize: number }
  maxCells: number
  maxSubdivision: number
}

export type AnalysisOptions = {
  optionsVersion: typeof ANALYSIS_OPTIONS_VERSION
  methodId: typeof STRAIN_DOMAIN_SURFACE_METHOD
  stations: {
    /** Informational origin of the resolved list; the list below remains authoritative. */
    basedOn: typeof UNIFIED_STATION_SCHEDULE | 'custom'
    intermediate: AnalysisStation[]
    refinement: StationRefinement
  }
  directions: {
    seed: DirectionSeed
    refinement: DirectionRefinement
  }
  mesh: AnalysisMeshOptions
}

/**
 * Sampling DTO for the equivalent rectangular stress-block pipeline.
 *
 * It deliberately has no concrete integration mesh. `neutralAxisStations` sample the physical
 * unknown c/D, while direction and station refinements measure interpolation error on the
 * resistance surface. This keeps the block solver independent from the fiber/curve solver.
 */
export type EquivalentBlockStation =
  | { type: 'extreme-tension-strain'; strain: number }
  | { type: 'bar-tension-yield-ratio'; ratio: number }
  | { type: 'depth-ratio'; ratio: number }

export type EquivalentBlockAnalysisOptions = {
  optionsVersion: typeof ANALYSIS_OPTIONS_VERSION
  methodId: typeof EQUIVALENT_BLOCK_SURFACE_METHOD
  neutralAxisStations: {
    basedOn: typeof UNIFIED_STATION_SCHEDULE | 'custom'
    values: EquivalentBlockStation[]
    refinement: StationRefinement
  }
  directions: {
    seedCount: number
    startDeg: number
    refinement:
      | { type: 'fixed' }
      | { type: 'adaptive'; tolerance: number; maxPasses: number; maxDirections: number }
  }
}

/** Project/UI union. Numerical kernels continue to accept their own narrowed DTO. */
export type CalculationAnalysisOptions = AnalysisOptions | EquivalentBlockAnalysisOptions

const station = (id: number, label: string, criterion: AnalysisStationCriterion): AnalysisStation => ({
  id,
  label,
  criterion
})

/**
 * Shared 22-station production baseline for the strain-domain model.
 * The neutral axis is parameterized by c/D outside the section and by the controlling bar's
 * tensile strain divided by its own yield strain inside the section.
 */
export const createDefaultAnalysisOptions = (): AnalysisOptions => ({
  optionsVersion: ANALYSIS_OPTIONS_VERSION,
  methodId: STRAIN_DOMAIN_SURFACE_METHOD,
  stations: {
    basedOn: UNIFIED_STATION_SCHEDULE,
    intermediate: [
      ...UNIFIED_DEPTH_RATIOS.map((ratio, index) =>
        station(index + 1, `c/D = ${ratio}`, { type: 'depth-ratio', ratio })
      ),
      ...UNIFIED_STEEL_STRAIN_YIELD_RATIOS.map((ratio, index) =>
        station(
          UNIFIED_DEPTH_RATIOS.length + index + 1,
          `εₛ/εy = ${ratio}`,
          { type: 'bar-tension-yield-ratio', ratio }
        )
      )
    ],
    refinement: {
      type: 'adaptive',
      tolerance: ADAPTIVE_INTERPOLATION_TOLERANCE,
      maxPasses: ADAPTIVE_MAX_PASSES,
      maxStations: ADAPTIVE_MAX_STATIONS
    }
  },
  directions: {
    seed: { type: 'uniform', count: FIXED_DIRECTION_COUNT, startDeg: 0 },
    refinement: {
      type: 'adaptive',
      tolerance: ADAPTIVE_INTERPOLATION_TOLERANCE,
      maxPasses: ADAPTIVE_MAX_PASSES,
      maxDirections: ADAPTIVE_MAX_DIRECTIONS,
      probe: 'all'
    }
  },
  mesh: {
    sizing: { type: 'automatic', seedDivisions: 32 },
    maxCells: 250_000,
    maxSubdivision: 4
  }
})

/** Shared 22-station production baseline for every equivalent-block model. */
export const createDefaultEquivalentBlockAnalysisOptions = (): EquivalentBlockAnalysisOptions => ({
  optionsVersion: ANALYSIS_OPTIONS_VERSION,
  methodId: EQUIVALENT_BLOCK_SURFACE_METHOD,
  neutralAxisStations: {
    basedOn: UNIFIED_STATION_SCHEDULE,
    values: [
      ...UNIFIED_DEPTH_RATIOS.map((ratio) => ({ type: 'depth-ratio' as const, ratio })),
      ...UNIFIED_STEEL_STRAIN_YIELD_RATIOS.map((ratio) => ({
        type: 'bar-tension-yield-ratio' as const,
        ratio
      }))
    ],
    refinement: {
      type: 'adaptive',
      tolerance: ADAPTIVE_INTERPOLATION_TOLERANCE,
      maxPasses: ADAPTIVE_MAX_PASSES,
      maxStations: ADAPTIVE_MAX_STATIONS
    }
  },
  directions: {
    seedCount: FIXED_DIRECTION_COUNT,
    startDeg: 0,
    refinement: {
      type: 'adaptive',
      tolerance: ADAPTIVE_INTERPOLATION_TOLERANCE,
      maxPasses: ADAPTIVE_MAX_PASSES,
      maxDirections: ADAPTIVE_MAX_DIRECTIONS
    }
  }
})

export const cloneAnalysisOptions = (options: AnalysisOptions): AnalysisOptions =>
  JSON.parse(JSON.stringify(options)) as AnalysisOptions

export const cloneCalculationAnalysisOptions = <T extends CalculationAnalysisOptions>(options: T): T =>
  JSON.parse(JSON.stringify(options)) as T

export const analysisStationCount = (options: AnalysisOptions) => options.stations.intermediate.length + 2

export const calculationStationCount = (options: CalculationAnalysisOptions) =>
  options.methodId === STRAIN_DOMAIN_SURFACE_METHOD
    ? analysisStationCount(options)
    : options.neutralAxisStations.values.length + 2

export const isEquivalentBlockAnalysisOptions = (
  options: CalculationAnalysisOptions
): options is EquivalentBlockAnalysisOptions => options.methodId === EQUIVALENT_BLOCK_SURFACE_METHOD

/** Convert the persisted, UI-facing mesh settings to the geometry kernel's structural options. */
export const analysisMeshKernelOptions = (options: AnalysisOptions) => ({
  ...(options.mesh.sizing.type === 'automatic'
    ? { seedDivisions: options.mesh.sizing.seedDivisions }
    : { cellSize: options.mesh.sizing.cellSize }),
  maxCells: options.mesh.maxCells,
  maxSubdivision: options.mesh.maxSubdivision
})
