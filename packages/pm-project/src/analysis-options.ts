/**
 * Serializable analysis configuration.
 *
 * This package owns the persisted DTO only. Geometry/material-aware normalization and engineering
 * validation live in `@pm/analysis`; React and worker code must pass this object through unchanged.
 */
export const ANALYSIS_OPTIONS_VERSION = 1 as const
export const STRAIN_DOMAIN_SURFACE_METHOD = 'strain-domain-surface-v1' as const

export const MAX_INTERMEDIATE_STATIONS = 198
export const MAX_STATION_LABEL_LENGTH = 120
export const MAX_SEED_DIRECTIONS = 360
export const MAX_REFINED_DIRECTIONS = 720
export const MAX_MESH_SEED_DIVISIONS = 256
export const MAX_MESH_CELLS = 1_000_000
export const MAX_MESH_SUBDIVISION = 8

export type AnalysisStationCriterion =
  | { type: 'c-over-c1'; ratio: number }
  | { type: 'steel-stress-ratio'; ratio: number }
  | { type: 'steel-strain'; strain: number }

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
    basedOn: 'legacy-p0-p18-v1' | 'custom'
    intermediate: AnalysisStation[]
  }
  directions: {
    seed: DirectionSeed
    refinement: DirectionRefinement
  }
  mesh: AnalysisMeshOptions
}

const station = (id: number, label: string, criterion: AnalysisStationCriterion): AnalysisStation => ({
  id,
  label,
  criterion
})

/** The historical P1…P17 schedule and 24 directions, expressed as canonical data. */
export const createDefaultAnalysisOptions = (): AnalysisOptions => ({
  optionsVersion: ANALYSIS_OPTIONS_VERSION,
  methodId: STRAIN_DOMAIN_SURFACE_METHOD,
  stations: {
    basedOn: 'legacy-p0-p18-v1',
    intermediate: [
      station(1, 'c = 3·c₁', { type: 'c-over-c1', ratio: 3 }),
      station(2, 'c = 2·c₁', { type: 'c-over-c1', ratio: 2 }),
      station(3, 'c = 1.5·c₁', { type: 'c-over-c1', ratio: 1.5 }),
      station(4, 'c = 1.2·c₁', { type: 'c-over-c1', ratio: 1.2 }),
      station(5, 'fₛ = 0', { type: 'steel-stress-ratio', ratio: 0 }),
      station(6, 'fₛ = 0.25·fyd', { type: 'steel-stress-ratio', ratio: 0.25 }),
      station(7, 'fₛ = 0.5·fyd', { type: 'steel-stress-ratio', ratio: 0.5 }),
      station(8, 'fₛ = 0.75·fyd', { type: 'steel-stress-ratio', ratio: 0.75 }),
      station(9, 'fₛ = fyd', { type: 'steel-stress-ratio', ratio: 1 }),
      station(10, 'εₛ = -0.003', { type: 'steel-strain', strain: -0.003 }),
      station(11, 'εₛ = -0.005', { type: 'steel-strain', strain: -0.005 }),
      station(12, 'εₛ = -0.0075', { type: 'steel-strain', strain: -0.0075 }),
      station(13, 'εₛ = -0.01', { type: 'steel-strain', strain: -0.01 }),
      station(14, 'εₛ = -0.015', { type: 'steel-strain', strain: -0.015 }),
      station(15, 'εₛ = -0.025', { type: 'steel-strain', strain: -0.025 }),
      station(16, 'εₛ = -0.03', { type: 'steel-strain', strain: -0.03 }),
      station(17, 'εₛ = -0.05', { type: 'steel-strain', strain: -0.05 })
    ]
  },
  directions: {
    seed: { type: 'uniform', count: 24, startDeg: 0 },
    refinement: { type: 'fixed', probe: { stationIds: [5, 10, 14, 16] } }
  },
  mesh: {
    sizing: { type: 'automatic', seedDivisions: 32 },
    maxCells: 250_000,
    maxSubdivision: 4
  }
})

export const cloneAnalysisOptions = (options: AnalysisOptions): AnalysisOptions =>
  JSON.parse(JSON.stringify(options)) as AnalysisOptions

export const analysisStationCount = (options: AnalysisOptions) => options.stations.intermediate.length + 2

/** Convert the persisted, UI-facing mesh settings to the geometry kernel's structural options. */
export const analysisMeshKernelOptions = (options: AnalysisOptions) => ({
  ...(options.mesh.sizing.type === 'automatic'
    ? { seedDivisions: options.mesh.sizing.seedDivisions }
    : { cellSize: options.mesh.sizing.cellSize }),
  maxCells: options.mesh.maxCells,
  maxSubdivision: options.mesh.maxSubdivision
})
