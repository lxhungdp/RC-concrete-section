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
  buildExactDirectionCurveFromPrepared,
  checkLoadcaseUtilizationFromSurface,
  codeAdjustedDemandOfCheck,
  prepareAnalysis,
  sliceActiveDesignPContour,
  solveInversePreviewFromPrepared,
  strainGradientDirection,
  type ExactDirectionCurve,
  type InversePreviewResult,
  type PreviewSurface
} from '@pm/analysis'
import {
  buildEquivalentBlockExactDirectionCurveFromPrepared,
  prepareBlockAnalysis,
  solveEquivalentBlockDemandsFromPrepared
} from '@pm/analysis-equivalent-block'
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
}

export type SolvedLoadcase = {
  loadcase: LoadCombination
  result: InversePreviewResult
  /**
   * Strain-gradient direction of the converged state, radians. Null when equilibrium defines none —
   * an unconverged solve, an inadmissible plane, or a state with no curvature.
   */
  beta: number | null
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
   * Exact meridian in the requested strain direction, memoised: several loadcases in one report
   * routinely converge on the same β, and each curve is a full station sweep.
   */
  exactDirectionCurve: (beta: number) => ExactDirectionCurve
}

/** Two β that agree to this many radians share a meridian; ~6e-6 degrees. */
const BETA_CACHE_TOLERANCE = 1e-7

export const solveLoadcases = (input: LoadcaseSolutionInput): LoadcaseSolutions => {
  const { section, rebars, materialStore, designBasis, surface } = input
  const isBlock = isEquivalentBlockProfileId(input.calculationProfileId)
  const solutions: SolvedLoadcase[] = []

  const withBeta = (loadcase: LoadCombination, result: InversePreviewResult): SolvedLoadcase => ({
    loadcase,
    result,
    beta: result.ok && result.admissibility.evaluated ? strainGradientDirection(result.state) : null
  })

  let prepared: ReturnType<typeof prepareAnalysis> | null = null
  let blockPrepared: ReturnType<typeof prepareBlockAnalysis> | null = null

  if (isBlock) {
    blockPrepared = prepareBlockAnalysis(
      input.calculationProfileId,
      section,
      rebars,
      materialStore,
      designBasis
    )
    const options = input.analysisOptions as EquivalentBlockAnalysisOptions
    const solved = solveEquivalentBlockDemandsFromPrepared(blockPrepared, options, input.loadcases)
    input.loadcases.forEach((loadcase, index) => {
      solutions.push(withBeta(loadcase, solved[index]))
    })
  } else {
    const options = input.analysisOptions as AnalysisOptions
    const stateMaterials = buildResistanceMaterialSets(materialStore, designBasis).stateMaterials
    prepared = prepareAnalysis(section, rebars, stateMaterials, analysisMeshKernelOptions(options))
    for (const loadcase of input.loadcases) {
      const contour = sliceActiveDesignPContour(surface, loadcase.P)
      const designCheck = checkLoadcaseUtilizationFromSurface(surface, loadcase)
      const result = applyDesignCheckToInverse(
        solveInversePreviewFromPrepared(
          prepared,
          loadcase,
          contour,
          codeAdjustedDemandOfCheck(designCheck)
        ),
        designCheck
      )
      solutions.push(withBeta(loadcase, result))
    }
  }

  const cache: Array<{ beta: number; curve: ExactDirectionCurve }> = []
  const exactDirectionCurve = (beta: number) => {
    const hit = cache.find((entry) => Math.abs(entry.beta - beta) <= BETA_CACHE_TOLERANCE)
    if (hit) return hit.curve
    const curve = blockPrepared
      ? buildEquivalentBlockExactDirectionCurveFromPrepared(
          blockPrepared,
          input.analysisOptions as EquivalentBlockAnalysisOptions,
          beta
        )
      : buildExactDirectionCurveFromPrepared(
          prepared!,
          materialStore,
          designBasis,
          input.analysisOptions as AnalysisOptions,
          beta
        )
    cache.push({ beta, curve })
    return curve
  }

  return {
    mechanics: isBlock ? 'equivalent-rectangular-block' : 'stress-strain-integration',
    prepared,
    blockPrepared,
    solutions,
    byId: new Map(solutions.map((solution) => [solution.loadcase.id, solution])),
    exactDirectionCurve
  }
}
