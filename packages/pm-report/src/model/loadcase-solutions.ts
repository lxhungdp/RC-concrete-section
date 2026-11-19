import type { DemandCheckBasis } from '@pm/project'
/**
 * One inverse solve per loadcase, shared by every output format.
 *
 * The PDF report and the demand-check workbook publish the same check, so they must not each run
 * their own version of it: two solves of the same combination that disagree in the last digit
 * produce a report and a workbook that a reviewer cannot reconcile. This module owns the solve,
 * both formats read it, and neither adds a step of its own.
 *
 * It composes exactly what the application composes — the inverse gives the equilibrium state, the
 * design surface ray gives adequacy — so a published check is reproducible from the surface on
 * screen rather than from a second calculation of it.
 */
import {
  applyDesignCheckToInverse,
  checkLoadcaseUtilizationFromSurface,
  codeAdjustedDemandOfCheck,
  prepareAnalysis,
  resolveLoadcaseField,
  sliceActiveDesignPContour,
  solveInversePreviewFromPrepared,
  strainGradientDirection,
  type CapacityFieldResult,
  type InversePreviewResult,
  type LoadDirectionCurve,
  type PreviewSurface
} from '@pm/analysis'
import {
  buildEquivalentBlockDesignSurfaceFromPrepared,
  createEquivalentBlockLoadDirectionMechanics,
  prepareBlockAnalysis,
  solveEquivalentBlockDemandsFromPrepared
} from '@pm/analysis-equivalent-block'
import { solveStressStrainCapacityFieldFromPrepared } from '@pm/analysis/capacity-field'
import {
  buildLoadDirectionCurve,
  createStressStrainLoadDirectionMechanics,
  type LoadDirectionMechanics
} from '@pm/analysis/load-direction'
import { buildResistanceMaterialSets, type DesignBasis } from '@pm/design'
import type { GeometryInputRebarView, SectionGeometry } from '@pm/geometry'
import type { MaterialStore } from '@pm/materials'
import {
  analysisMeshKernelOptions,
  isEquivalentBlockProfileId,
  type AnalysisOptions,
  type CalculationAnalysisOptions,
  type CalculationProfileId,
  type EquivalentBlockAnalysisOptions,
  type LoadCombination
} from '@pm/project'

export type LoadcaseSolutionInput = {
  calculationProfileId: CalculationProfileId
  section: SectionGeometry
  rebars: GeometryInputRebarView[]
  materialStore: MaterialStore
  designBasis: DesignBasis
  analysisOptions: CalculationAnalysisOptions
  /** Governing surface already built by the application; never rebuilt here. */
  surface: PreviewSurface
  loadcases: readonly LoadCombination[]
  checkBasis?: DemandCheckBasis
}

export type SolvedLoadcase = {
  loadcase: LoadCombination
  result: InversePreviewResult
  /**
   * engineering/05 §3: strain-gradient direction of the strength point of the selected check, radians.
   * Null when no qualified strength-point state exists.
   */
  beta: number | null
  /** Checked demand moment direction θ = atan2(Muy, Mux) (code-adjusted); null for zero moment. */
  theta: number | null
}

export type LoadcaseSolutions = {
  mechanics: 'stress-strain-integration' | 'equivalent-rectangular-block'
  /** Prepared stress-strain analysis; null for the equivalent-block mechanics. */
  prepared: ReturnType<typeof prepareAnalysis> | null
  /** Prepared block analysis; null for the stress-strain mechanics. */
  blockPrepared: ReturnType<typeof prepareBlockAnalysis> | null
  solutions: SolvedLoadcase[]
  byId: Map<number, SolvedLoadcase>
  /**
   * Load-direction P–M curve of one θ (engineering/05 §3), memoised: loadcases with the same moment
   * direction share it.
   */
  loadDirectionCurve: (theta: number) => LoadDirectionCurve
}

/** Two θ that agree to this many radians share a curve; ~6e-6 degrees. */
const THETA_CACHE_TOLERANCE = 1e-7

export const solveLoadcases = (input: LoadcaseSolutionInput): LoadcaseSolutions => {
  const { section, rebars, materialStore, designBasis, surface } = input
  const isBlock = isEquivalentBlockProfileId(input.calculationProfileId)
  const checkBasis = input.checkBasis ?? 'proportional3D'
  const solutions: SolvedLoadcase[] = []

  const solved = (loadcase: LoadCombination, result: InversePreviewResult): SolvedLoadcase => {
    const field = resolveLoadcaseField(result)
    const checked = result.codeAdjustedDemand ?? result.demand
    return {
      loadcase,
      result,
      beta: field.status === 'available' ? strainGradientDirection(field.state) : null,
      theta: Math.hypot(checked.Mx, checked.My) > 0 ? Math.atan2(checked.My, checked.Mx) : null
    }
  }

  let prepared: ReturnType<typeof prepareAnalysis> | null = null
  let blockPrepared: ReturnType<typeof prepareBlockAnalysis> | null = null
  let blockCore: ReturnType<typeof buildEquivalentBlockDesignSurfaceFromPrepared> | null = null

  if (isBlock) {
    blockPrepared = prepareBlockAnalysis(input.calculationProfileId, section, rebars, materialStore, designBasis)
    const options = input.analysisOptions as EquivalentBlockAnalysisOptions
    blockCore = buildEquivalentBlockDesignSurfaceFromPrepared(blockPrepared, options)
    const results = solveEquivalentBlockDemandsFromPrepared(blockPrepared, options, input.loadcases, blockCore, checkBasis)
    input.loadcases.forEach((loadcase, index) => {
      solutions.push(solved(loadcase, applyDesignCheckToInverse(results[index],
        checkLoadcaseUtilizationFromSurface(surface, loadcase, checkBasis))))
    })
  } else {
    const options = input.analysisOptions as AnalysisOptions
    const stateMaterials = buildResistanceMaterialSets(materialStore, designBasis).stateMaterials
    prepared = prepareAnalysis(section, rebars, stateMaterials, analysisMeshKernelOptions(options))
    for (const loadcase of input.loadcases) {
      const contour = sliceActiveDesignPContour(surface, loadcase.P)
      const designCheck = checkLoadcaseUtilizationFromSurface(surface, loadcase, checkBasis)
      const inverse = solveInversePreviewFromPrepared(prepared, loadcase, contour, codeAdjustedDemandOfCheck(designCheck))
      // The same strength-point resolver as the application worker (engineering/05 §3).
      let capacityField: CapacityFieldResult
      try {
        capacityField = solveStressStrainCapacityFieldFromPrepared(prepared, materialStore, designBasis, surface,
          designCheck.codeAdjustedDemand ?? loadcase, checkBasis)
      } catch {
        capacityField = { status: 'unavailable', reason: 'evaluation-error', iterations: 0, message: 'Capacity-field evaluation failed.' }
      }
      solutions.push(solved(loadcase, { ...applyDesignCheckToInverse(inverse, designCheck), capacityField }))
    }
  }

  const cache: Array<{ theta: number; curve: LoadDirectionCurve }> = []
  let mechanics: LoadDirectionMechanics | undefined
  const loadDirectionCurve = (theta: number) => {
    const hit = cache.find((entry) => Math.abs(Math.atan2(Math.sin(entry.theta - theta), Math.cos(entry.theta - theta))) <= THETA_CACHE_TOLERANCE)
    if (hit) return hit.curve
    mechanics ??= blockPrepared && blockCore
      ? createEquivalentBlockLoadDirectionMechanics(blockPrepared, input.analysisOptions as EquivalentBlockAnalysisOptions, blockCore)
      : createStressStrainLoadDirectionMechanics(prepared!, materialStore, designBasis, surface)
    const curve = buildLoadDirectionCurve(surface, theta, mechanics)
    cache.push({ theta, curve })
    return curve
  }

  return {
    mechanics: isBlock ? 'equivalent-rectangular-block' : 'stress-strain-integration',
    prepared,
    blockPrepared,
    solutions,
    byId: new Map(solutions.map((solution) => [solution.loadcase.id, solution])),
    loadDirectionCurve
  }
}
