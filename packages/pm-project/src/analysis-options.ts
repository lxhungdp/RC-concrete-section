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

export type AnalysisStationCriterion =
  | { type: 'c-over-c1'; ratio: number }
  | { type: 'steel-stress-ratio'; ratio: number }
  | { type: 'steel-strain'; strain: number }
  /** Fraction from eps_y to the code-defined tension-controlled strain limit. */
  | { type: 'strength-reduction-transition-ratio'; ratio: number }
  /** Absolute tensile-strain increment beyond the code-defined transition limit. */
  | { type: 'strength-reduction-post-transition'; extraStrain: number }

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
    basedOn: 'transition-aware-p0-p24-v1' | 'legacy-p0-p18-v1' | 'custom'
    intermediate: AnalysisStation[]
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
  | { type: 'depth-ratio'; ratio: number }

export type EquivalentBlockAnalysisOptions = {
  optionsVersion: typeof ANALYSIS_OPTIONS_VERSION
  methodId: typeof EQUIVALENT_BLOCK_SURFACE_METHOD
  neutralAxisStations: {
    basedOn: 'verified-37-v1' | 'custom'
    values: EquivalentBlockStation[]
    refinement:
      | { type: 'fixed' }
      | { type: 'adaptive'; tolerance: number; maxPasses: number; maxStations: number }
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

/** The historical P1…P17 schedule and 24 directions, expressed as canonical data. */
export const createLegacyAnalysisOptions = (): AnalysisOptions => ({
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

/**
 * Production default for the strain-domain model.
 *
 * P9 is the yield boundary. P9 plus P10-P17 are the nine mandatory nodes across
 * the code-defined strength-reduction transition. Thirty-six directions are the
 * seed, not a hard ceiling; refinement enforces a 0.5% angular interpolation target.
 */
export const createDefaultAnalysisOptions = (): AnalysisOptions => ({
  optionsVersion: ANALYSIS_OPTIONS_VERSION,
  methodId: STRAIN_DOMAIN_SURFACE_METHOD,
  stations: {
    basedOn: 'transition-aware-p0-p24-v1',
    intermediate: [
      station(1, 'c = 3 c1', { type: 'c-over-c1', ratio: 3 }),
      station(2, 'c = 2 c1', { type: 'c-over-c1', ratio: 2 }),
      station(3, 'c = 1.5 c1', { type: 'c-over-c1', ratio: 1.5 }),
      station(4, 'c = 1.2 c1', { type: 'c-over-c1', ratio: 1.2 }),
      station(5, 'fs = 0', { type: 'steel-stress-ratio', ratio: 0 }),
      station(6, 'fs = 0.25 fyd', { type: 'steel-stress-ratio', ratio: 0.25 }),
      station(7, 'fs = 0.5 fyd', { type: 'steel-stress-ratio', ratio: 0.5 }),
      station(8, 'fs = 0.75 fyd', { type: 'steel-stress-ratio', ratio: 0.75 }),
      station(9, 'eps_t = eps_y (transition 0/8)', { type: 'steel-stress-ratio', ratio: 1 }),
      ...Array.from({ length: 8 }, (_, index) => {
        const numerator = index + 1
        return station(9 + numerator, `phi transition ${numerator}/8`, {
          type: 'strength-reduction-transition-ratio',
          ratio: numerator / 8
        })
      }),
      station(18, 'post-transition +0.0025', {
        type: 'strength-reduction-post-transition',
        extraStrain: 0.0025
      }),
      station(19, 'post-transition +0.005', {
        type: 'strength-reduction-post-transition',
        extraStrain: 0.005
      }),
      station(20, 'post-transition +0.01', {
        type: 'strength-reduction-post-transition',
        extraStrain: 0.01
      }),
      station(21, 'post-transition +0.02', {
        type: 'strength-reduction-post-transition',
        extraStrain: 0.02
      }),
      station(22, 'post-transition +0.025', {
        type: 'strength-reduction-post-transition',
        extraStrain: 0.025
      }),
      station(23, 'post-transition +0.045', {
        type: 'strength-reduction-post-transition',
        extraStrain: 0.045
      })
    ]
  },
  directions: {
    seed: { type: 'uniform', count: 36, startDeg: 0 },
    refinement: {
      type: 'adaptive',
      tolerance: 0.005,
      maxPasses: 6,
      maxDirections: 360,
      probe: 'all'
    }
  },
  mesh: {
    sizing: { type: 'automatic', seedDivisions: 32 },
    maxCells: 250_000,
    maxSubdivision: 4
  }
})

/** 37 neutral-axis states + the two exact uniform-strain poles. */
export const createDefaultEquivalentBlockAnalysisOptions = (): EquivalentBlockAnalysisOptions => ({
  optionsVersion: ANALYSIS_OPTIONS_VERSION,
  methodId: EQUIVALENT_BLOCK_SURFACE_METHOD,
  neutralAxisStations: {
    basedOn: 'verified-37-v1',
    values: [
      ...[
        0.1, 0.075, 0.05, 0.04, 0.03, 0.025, 0.02, 0.0175, 0.015, 0.0125, 0.01,
        0.00875, 0.0075, 0.00625, 0.005, 0.004, 0.003, 0.0025, 0.002, 0.0015,
        0.001, 0.0005, 0
      ].map((strain) => ({ type: 'extreme-tension-strain' as const, strain })),
      ...[1.1, 1.2, 1.35, 1.5, 1.75, 2, 2.5, 3, 4, 5, 7.5, 10, 20, 50].map((ratio) => ({
        type: 'depth-ratio' as const,
        ratio
      }))
    ],
    refinement: { type: 'adaptive', tolerance: 0.0075, maxPasses: 6, maxStations: 128 }
  },
  directions: {
    seedCount: 24,
    startDeg: 0,
    refinement: { type: 'adaptive', tolerance: 0.0075, maxPasses: 6, maxDirections: 360 }
  }
})

export const createVerifiedEquivalentBlockAnalysisOptions = createDefaultEquivalentBlockAnalysisOptions

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
