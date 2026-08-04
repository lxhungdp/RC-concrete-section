export type Point2 = {
  x: number
  y: number
}

export type PolygonSolid = {
  outer: Point2[]
  holes?: Point2[][]
}

export type EquivalentBlockRebar = {
  id: string
  x: number
  y: number
  area: number
  steelLawId: string
}

export type EquivalentBlockSection = {
  solids: PolygonSolid[]
  rebars: EquivalentBlockRebar[]
  referencePoint: Point2
  units: 'N-mm-MPa'
  signConvention: 'compression-positive'
}

export type PreparedPolygonSolid = {
  outer: Point2[]
  holes: Point2[][]
}

export type SectionBounds = {
  minX: number
  maxX: number
  minY: number
  maxY: number
  width: number
  height: number
}

export type PreparedEquivalentBlockSection = {
  solids: PreparedPolygonSolid[]
  rebars: EquivalentBlockRebar[]
  referencePoint: Point2
  units: 'N-mm-MPa'
  signConvention: 'compression-positive'
  grossArea: number
  centroid: Point2
  bounds: SectionBounds
  characteristicLength: number
  inputHash: string
}

export type EquivalentBlockLaw = {
  compressionStress: number
  depthFactor: number
  extremeCompressionStrain: number
  subtractDisplacedConcrete: boolean
}

export type SteelLaw = {
  stressAt: (strain: number) => number
  yieldStrain?: number
  ultimateStrain?: number
}

export type SteelLawRegistry = Readonly<Record<string, SteelLaw>>

export type BlockSectionState = {
  neutralAxisAngle: number
  neutralAxisDepth: number
}

export type CapacityResultants = {
  P: number
  Mx: number
  /** Project-wide convention: positive force at positive x produces positive My. */
  My: number
}

export type PolygonMoments = {
  area: number
  firstMomentX: number
  firstMomentY: number
  centroid: Point2
}

export type ClippedBlockSolid = {
  outer: Point2[]
  holes: Point2[][]
}

export type ConcreteBlockEvaluation = PolygonMoments & {
  stress: number
  force: number
  Mx: number
  My: number
  geometry: ClippedBlockSolid[]
}

export type BarBlockEvaluation = {
  id: string
  x: number
  y: number
  area: number
  steelLawId: string
  projectedDepth: number
  strain: number
  tensileStrain: number
  yieldStrain?: number
  ultimateStrain?: number
  steelStress: number
  displacedConcreteStress: number
  netStress: number
  force: number
  Mx: number
  My: number
  insideBlock: boolean
}

export type BlockEvaluationDiagnostics = {
  projectedSectionDepth: number
  compressionEdgeProjection: number
  neutralAxisProjection: number
  blockBoundaryProjection: number
  /** Floating-point component reconstruction check; not an equilibrium residual. */
  componentForceResidual: number
  componentMomentXResidual: number
  componentMomentYResidual: number
}

export type NominalBlockEvaluation = {
  state: BlockSectionState & { blockDepth: number }
  resultants: CapacityResultants
  concrete: ConcreteBlockEvaluation
  bars: BarBlockEvaluation[]
  controllingTensileStrain: number
  controllingBarId?: string
  controllingYieldStrain?: number
  diagnostics: BlockEvaluationDiagnostics
}

export type UniformSectionStateOptions = {
  concreteStress: number
  steelStrain: number
  subtractDisplacedConcrete: boolean
}

export type UniformSectionBarEvaluation = {
  id: string
  strain: number
  steelStress: number
  displacedConcreteStress: number
  netStress: number
  force: number
  Mx: number
  My: number
}

export type UniformSectionEvaluation = {
  resultants: CapacityResultants
  concrete: {
    stress: number
    force: number
    Mx: number
    My: number
  }
  bars: UniformSectionBarEvaluation[]
}

export type EquivalentBlockErrorCode =
  | 'INVALID_GEOMETRY'
  | 'INVALID_REBAR'
  | 'INVALID_BLOCK_LAW'
  | 'INVALID_STATE'
  | 'MISSING_STEEL_LAW'
  | 'SOLVER_INPUT'

export class EquivalentBlockInputError extends Error {
  readonly code: EquivalentBlockErrorCode

  constructor(code: EquivalentBlockErrorCode, message: string) {
    super(message)
    this.name = 'EquivalentBlockInputError'
    this.code = code
  }
}
