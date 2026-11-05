import {
  analysisInputKey, applyDesignCheckToInverse, buildDesignPreviewSurfaceFromPrepared,
  buildExactDirectionCurveFromPrepared, buildStressStrainPointCalculationAudit,
  buildSectionFieldMapFromPrepared, checkLoadcaseUtilizationFromSurface,
  checkLoadcasesUtilizationFromSurface, codeAdjustedDemandOfCheck, prepareAnalysis,
  sliceActiveDesignPContour, solveDirect2DLoadcase, solveInversePreviewFromPrepared, surfaceInputKey,
  type PreparedAnalysis
} from '@pm/analysis'
import {
  buildEquivalentBlockDesignSurfaceFromPrepared, buildEquivalentBlockExactDirectionCurveFromPrepared,
  buildEquivalentBlockPreviewSurfaceFromPrepared, buildEquivalentBlockFieldMapFromPrepared,
  buildEquivalentBlockPointCalculationAudit, prepareBlockAnalysis, solveEquivalentBlockDemandFromPrepared, solveEquivalentBlockDemandRaw,
  type EquivalentBlockDesignSurface, type PreparedBlockAnalysis
} from '@pm/analysis-equivalent-block'
import type { CapacityFieldResult, PreviewSurface } from '@pm/results/contracts'
import { AnalysisInputError } from '@pm/results/errors'
import { assertValidMaterialStore, MaterialInputError, MaterialEvaluationError } from '@pm/materials'
import { GeometryResourceLimitError } from '@pm/geometry'
import { buildResistanceMaterialSets, createDefaultDesignBasis, type DesignBasis } from '@pm/design'
import { analysisMeshKernelOptions, isEquivalentBlockAnalysisOptions, type AnalysisOptions } from '@pm/project'
import { BoundedLruCache } from './bounded-lru'
import type {
  BuildExactDirectionPayload, BuildFieldMapPayload, BuildPointAuditsPayload,
  BuildSectionMeshPayload, BuildSurfacePayload, CheckLoadcasePayload, CheckLoadcasesPayload
} from './worker-contract'

type StressPreparation = Pick<BuildSurfacePayload, 'section' | 'rebars' | 'materialStore'> & { analysisOptions: AnalysisOptions; designBasis?: DesignBasis }
type BlockPreparation = Pick<BuildSurfacePayload, 'calculationProfileId' | 'section' | 'rebars' | 'materialStore' | 'designBasis'>

const expectedFailure = (error: unknown): unknown => {
  if (error instanceof MaterialInputError) return new AnalysisInputError('INVALID_MATERIAL', error.message, { issues: error.issues })
  if (error instanceof MaterialEvaluationError) return new AnalysisInputError('NON_FINITE_ANALYSIS', error.message)
  if (error instanceof GeometryResourceLimitError) return new AnalysisInputError('GEOMETRY_RESOURCE_LIMIT', error.message)
  return error
}
const guard = <A extends unknown[], R>(run: (...args: A) => R) => (...args: A): R => {
  try { return run(...args) } catch (error) { throw expectedFailure(error) }
}

/** One use-case implementation for worker and fallback; transport and export I/O stay outside. */
export const createAnalysisExecution = () => {
  const prepared = new BoundedLruCache<string, PreparedAnalysis>(2)
  const preparedBlocks = new BoundedLruCache<string, PreparedBlockAnalysis>(2)
  const surfaces = new BoundedLruCache<string, PreviewSurface>(2)
  const blockSurfaces = new BoundedLruCache<string, { core: EquivalentBlockDesignSurface; preview: PreviewSurface }>(2)

  const stressFor = (payload: StressPreparation) => {
    assertValidMaterialStore(payload.materialStore)
    const mesh = analysisMeshKernelOptions(payload.analysisOptions)
    const basis = payload.designBasis ?? createDefaultDesignBasis(payload.materialStore)
    const stateMaterials = buildResistanceMaterialSets(payload.materialStore, basis).stateMaterials
    const key = `${analysisInputKey(payload.section, payload.rebars, stateMaterials, mesh)}:${JSON.stringify(basis)}`
    const cached = prepared.get(key)
    if (cached) return cached
    const result = prepareAnalysis(payload.section, payload.rebars, stateMaterials, mesh)
    prepared.set(key, result)
    return result
  }
  const blockFor = (payload: BlockPreparation) => {
    const key = JSON.stringify({ calculationProfileId: payload.calculationProfileId, section: payload.section,
      rebars: payload.rebars, materialStore: payload.materialStore, designBasis: payload.designBasis })
    const cached = preparedBlocks.get(key)
    if (cached) return cached
    const result = prepareBlockAnalysis(payload.calculationProfileId, payload.section, payload.rebars, payload.materialStore, payload.designBasis)
    preparedBlocks.set(key, result)
    return result
  }
  const stressKey = (payload: StressPreparation & { calculationProfileId: BuildSurfacePayload['calculationProfileId'] }) =>
    `${payload.calculationProfileId}:${surfaceInputKey(payload.section, payload.rebars, payload.materialStore, payload.analysisOptions)}:${JSON.stringify(payload.designBasis)}`
  const blockKey = (payload: BuildSurfacePayload) => JSON.stringify({ calculationProfileId: payload.calculationProfileId,
    section: payload.section, rebars: payload.rebars, materialStore: payload.materialStore,
    analysisOptions: payload.analysisOptions, designBasis: payload.designBasis })

  const buildSurface = (payload: BuildSurfacePayload): PreviewSurface => {
    if (isEquivalentBlockAnalysisOptions(payload.analysisOptions)) {
      const key = blockKey(payload), cached = blockSurfaces.get(key)
      if (cached) return cached.preview
      const model = blockFor(payload)
      const core = buildEquivalentBlockDesignSurfaceFromPrepared(model, payload.analysisOptions)
      const preview = buildEquivalentBlockPreviewSurfaceFromPrepared(model, payload.analysisOptions, core)
      preview.calculationProfileId = payload.calculationProfileId
      blockSurfaces.set(key, { core, preview })
      return preview
    }
    const input = { ...payload, analysisOptions: payload.analysisOptions }
    const key = stressKey(input), cached = surfaces.get(key)
    if (cached) return cached
    const result = buildDesignPreviewSurfaceFromPrepared(stressFor(input), payload.materialStore, payload.designBasis, payload.analysisOptions)
    result.calculationProfileId = payload.calculationProfileId
    surfaces.set(key, result)
    return result
  }
  const direct2D = async (payload: CheckLoadcasePayload) => {
    const { surface, loadcase, materialStore, designBasis } = payload
    const options = surface.analysisOptions
    if (isEquivalentBlockAnalysisOptions(options)) {
      const model = blockFor(payload)
      const key = blockKey({ ...payload, analysisOptions: options })
      const core = blockSurfaces.get(key)?.core ?? buildEquivalentBlockDesignSurfaceFromPrepared(model, options)
      return solveDirect2DLoadcase(surface, loadcase,
        demand => solveEquivalentBlockDemandRaw(model, options, demand, core, 'proportional3D'),
        beta => buildEquivalentBlockExactDirectionCurveFromPrepared(model, options, beta))
    }
    const { solveStressStrainDirect2DFromPrepared } = await import('@pm/analysis/capacity-field')
    return solveStressStrainDirect2DFromPrepared(stressFor({ ...payload, analysisOptions: options }), materialStore, designBasis, surface, loadcase)
  }
  const checkLoadcase = async (payload: CheckLoadcasePayload) => {
    if (payload.checkBasis === 'direct2D') return (await direct2D(payload)).result
    const options = payload.surface.analysisOptions
    if (isEquivalentBlockAnalysisOptions(options)) {
      const model = blockFor(payload)
      const key = blockKey({ ...payload, analysisOptions: options })
      const core = blockSurfaces.get(key)?.core ?? buildEquivalentBlockDesignSurfaceFromPrepared(model, options)
      return applyDesignCheckToInverse(
        solveEquivalentBlockDemandFromPrepared(model, options, payload.loadcase, core, payload.checkBasis),
        checkLoadcaseUtilizationFromSurface(payload.surface, payload.loadcase, payload.checkBasis)
      )
    }
    const input = { ...payload, analysisOptions: options }
    const surface = surfaces.get(stressKey(input)) ?? payload.surface
    const check = checkLoadcaseUtilizationFromSurface(surface, payload.loadcase, payload.checkBasis)
    const model = stressFor(input)
    const inverse = solveInversePreviewFromPrepared(model, payload.loadcase,
      sliceActiveDesignPContour(surface, payload.loadcase.P), codeAdjustedDemandOfCheck(check))
    let capacityField: CapacityFieldResult
    try {
      const { solveStressStrainCapacityFieldFromPrepared } = await import('@pm/analysis/capacity-field')
      capacityField = solveStressStrainCapacityFieldFromPrepared(model, payload.materialStore, payload.designBasis,
        surface, check.codeAdjustedDemand ?? payload.loadcase, payload.checkBasis)
    } catch {
      capacityField = { status: 'unavailable', reason: 'evaluation-error', iterations: 0, message: 'Capacity-field evaluation failed.' }
    }
    return { ...applyDesignCheckToInverse(inverse, check), capacityField }
  }
  const actions = {
    buildSurface,
    checkLoadcase: async (payload: CheckLoadcasePayload) => {
      try { return await checkLoadcase(payload) } catch (error) { throw expectedFailure(error) }
    },
    checkLoadcases: (payload: CheckLoadcasesPayload) => {
      if (payload.checkBasis !== 'direct2D' || !payload.preparedInputs) {
        return checkLoadcasesUtilizationFromSurface(payload.surface, payload.loadcases, payload.checkBasis)
      }
      const preparedInputs = payload.preparedInputs
      return (async () => {
        const checks = []
        for (const loadcase of payload.loadcases) {
          checks.push((await direct2D({ ...preparedInputs, surface: payload.surface, loadcase, checkBasis: 'direct2D' })).check)
        }
        return checks
      })()
    },
    buildExactDirection: (payload: BuildExactDirectionPayload) => isEquivalentBlockAnalysisOptions(payload.analysisOptions)
      ? buildEquivalentBlockExactDirectionCurveFromPrepared(blockFor(payload), payload.analysisOptions, payload.beta)
      : buildExactDirectionCurveFromPrepared(stressFor({ ...payload, analysisOptions: payload.analysisOptions }),
        payload.materialStore, payload.designBasis, payload.analysisOptions, payload.beta),
    buildFieldMap: (payload: BuildFieldMapPayload) => {
      if (isEquivalentBlockAnalysisOptions(payload.analysisOptions)) {
        if (!payload.blockState) throw new Error('The axial-cap face has no unique equivalent-block field state.')
        return buildEquivalentBlockFieldMapFromPrepared(blockFor(payload), payload.blockState)
      }
      return buildSectionFieldMapFromPrepared(stressFor({ ...payload, analysisOptions: payload.analysisOptions }), payload.state)
    },
    buildSectionMesh: (payload: BuildSectionMeshPayload) => stressFor(payload).mesh,
    buildPointAudits: (payload: BuildPointAuditsPayload) => {
      if (isEquivalentBlockAnalysisOptions(payload.analysisOptions)) {
        const model = blockFor(payload)
        return payload.points.map(({ key, point, stationDefinition }) => ({ key,
          audit: buildEquivalentBlockPointCalculationAudit(model, payload.stage, point, stationDefinition) }))
      }
      const model = stressFor({ ...payload, analysisOptions: payload.analysisOptions })
      return payload.points.map(({ key, point, stationDefinition }) => ({ key,
        audit: buildStressStrainPointCalculationAudit(model, payload.materialStore, payload.designBasis,
          payload.stage, point, stationDefinition) }))
    }
  }
  return {
    ...actions,
    buildSurface: guard(actions.buildSurface),
    checkLoadcases: guard(actions.checkLoadcases),
    buildExactDirection: guard(actions.buildExactDirection),
    buildFieldMap: guard(actions.buildFieldMap),
    buildSectionMesh: guard(actions.buildSectionMesh),
    buildPointAudits: guard(actions.buildPointAudits)
  }
}
