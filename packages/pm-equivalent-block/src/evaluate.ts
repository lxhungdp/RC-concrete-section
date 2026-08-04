import { clipPreparedSectionToHalfPlane, projectedOuterExtents, type ProjectedOuterExtents } from './geometry'
import {
  EquivalentBlockInputError,
  type BlockSectionState,
  type EquivalentBlockLaw,
  type NominalBlockEvaluation,
  type PreparedEquivalentBlockSection,
  type SteelLaw,
  type SteelLawRegistry
} from './types'

export const createElasticPerfectlyPlasticSteelLaw = (
  elasticModulus: number,
  yieldStress: number,
  ultimateStrain?: number
): SteelLaw => {
  if (!(elasticModulus > 0) || !(yieldStress > 0)) {
    throw new EquivalentBlockInputError('INVALID_BLOCK_LAW', 'Steel modulus and yield stress must be positive.')
  }
  const yieldStrain = yieldStress / elasticModulus
  if (ultimateStrain !== undefined && (
    !Number.isFinite(ultimateStrain) || ultimateStrain <= yieldStrain
  )) {
    throw new EquivalentBlockInputError(
      'INVALID_BLOCK_LAW',
      'Steel ultimate strain must be finite and greater than the yield strain.'
    )
  }
  return {
    yieldStrain,
    ultimateStrain,
    stressAt: (strain) => Math.max(-yieldStress, Math.min(yieldStress, elasticModulus * strain))
  }
}

/**
 * Bilinear steel with post-yield hardening.
 *
 * Standard-independent, like the elastic-perfectly-plastic law above: which law a profile is
 * allowed to register stays with the code adapter, not with this kernel.
 */
export const createBilinearSteelLaw = (
  elasticModulus: number,
  yieldStress: number,
  hardeningRatio: number,
  ultimateStrain?: number
): SteelLaw => {
  if (!(elasticModulus > 0) || !(yieldStress > 0)) {
    throw new EquivalentBlockInputError('INVALID_BLOCK_LAW', 'Steel modulus and yield stress must be positive.')
  }
  if (!Number.isFinite(hardeningRatio) || hardeningRatio < 0) {
    throw new EquivalentBlockInputError('INVALID_BLOCK_LAW', 'Steel hardening ratio must be finite and nonnegative.')
  }
  const yieldStrain = yieldStress / elasticModulus
  if (ultimateStrain !== undefined && (!Number.isFinite(ultimateStrain) || ultimateStrain <= yieldStrain)) {
    throw new EquivalentBlockInputError(
      'INVALID_BLOCK_LAW',
      'Steel ultimate strain must be finite and greater than the yield strain.'
    )
  }
  const hardening = hardeningRatio * elasticModulus
  return {
    yieldStrain,
    ultimateStrain,
    stressAt: (strain) => {
      const magnitude = Math.abs(strain)
      const stress = magnitude <= yieldStrain
        ? elasticModulus * magnitude
        : yieldStress + hardening * (magnitude - yieldStrain)
      return Math.sign(strain) * stress
    }
  }
}

/**
 * Linearly interpolated user table, clamped outside its own domain.
 *
 * The same first-matching-interval rule as the fibre kernel's tabulated law, so a user curve
 * evaluated by either pipeline returns the same stress for the same strain.
 */
export const createTabulatedSteelLaw = (
  points: ReadonlyArray<{ strain: number; stress: number }>,
  yieldStrain?: number,
  ultimateStrain?: number
): SteelLaw => {
  if (points.length < 2) {
    throw new EquivalentBlockInputError('INVALID_BLOCK_LAW', 'A tabulated steel law needs at least two points.')
  }
  for (const point of points) {
    if (!Number.isFinite(point.strain) || !Number.isFinite(point.stress)) {
      throw new EquivalentBlockInputError('INVALID_BLOCK_LAW', 'Tabulated steel points must be finite.')
    }
  }
  const sorted = [...points].sort((a, b) => a.strain - b.strain)
  if (sorted[0].strain === sorted[sorted.length - 1].strain) {
    throw new EquivalentBlockInputError('INVALID_BLOCK_LAW', 'A tabulated steel law needs two distinct strains.')
  }
  return {
    yieldStrain,
    ultimateStrain,
    stressAt: (strain) => {
      if (strain <= sorted[0].strain) return sorted[0].stress
      if (strain >= sorted[sorted.length - 1].strain) return sorted[sorted.length - 1].stress
      for (let index = 0; index < sorted.length - 1; index += 1) {
        const left = sorted[index]
        const right = sorted[index + 1]
        if (strain >= left.strain && strain <= right.strain) {
          const fraction = (strain - left.strain) / Math.max(1e-12, right.strain - left.strain)
          return left.stress + (right.stress - left.stress) * fraction
        }
      }
      return 0
    }
  }
}

const assertLaw = (law: EquivalentBlockLaw) => {
  if (
    !(law.compressionStress > 0) ||
    !(law.depthFactor > 0) ||
    !(law.extremeCompressionStrain > 0) ||
    !Number.isFinite(law.compressionStress) ||
    !Number.isFinite(law.depthFactor) ||
    !Number.isFinite(law.extremeCompressionStrain)
  ) {
    throw new EquivalentBlockInputError('INVALID_BLOCK_LAW', 'Equivalent block parameters must be finite and positive.')
  }
}

export const evaluateEquivalentBlock = (
  section: PreparedEquivalentBlockSection,
  law: EquivalentBlockLaw,
  steelLaws: SteelLawRegistry,
  state: BlockSectionState,
  preparedExtents?: ProjectedOuterExtents
): NominalBlockEvaluation => {
  assertLaw(law)
  if (
    !Number.isFinite(state.neutralAxisAngle) ||
    !Number.isFinite(state.neutralAxisDepth) ||
    !(state.neutralAxisDepth > 0)
  ) {
    throw new EquivalentBlockInputError('INVALID_STATE', 'Neutral-axis angle and positive depth must be finite.')
  }
  const normalX = Math.cos(state.neutralAxisAngle)
  const normalY = Math.sin(state.neutralAxisAngle)
  const extents = preparedExtents ?? projectedOuterExtents(section, normalX, normalY)
  const compressionEdgeProjection = extents.maximum
  const projectedSectionDepth = extents.depth
  const neutralAxisProjection = compressionEdgeProjection - state.neutralAxisDepth
  const blockDepth = law.depthFactor * state.neutralAxisDepth
  const blockBoundaryProjection = compressionEdgeProjection - blockDepth
  const clipped = clipPreparedSectionToHalfPlane(section, normalX, normalY, blockBoundaryProjection)
  const concreteForce = law.compressionStress * clipped.moments.area
  const concreteMx = law.compressionStress * (
    clipped.moments.firstMomentY - section.referencePoint.y * clipped.moments.area
  )
  const concreteMy = -law.compressionStress * (
    clipped.moments.firstMomentX - section.referencePoint.x * clipped.moments.area
  )

  const tolerance = 1e-10 * section.characteristicLength
  const bars = section.rebars.map((bar) => {
    const steelLaw = steelLaws[bar.steelLawId]
    if (!steelLaw) {
      throw new EquivalentBlockInputError('MISSING_STEEL_LAW', `Steel law ${bar.steelLawId} is not registered.`)
    }
    const projection = normalX * bar.x + normalY * bar.y
    const projectedDepth = compressionEdgeProjection - projection
    const strain = law.extremeCompressionStrain * (1 - projectedDepth / state.neutralAxisDepth)
    const steelStress = steelLaw.stressAt(strain)
    if (!Number.isFinite(steelStress)) {
      throw new EquivalentBlockInputError('INVALID_BLOCK_LAW', `Steel law ${bar.steelLawId} returned a non-finite stress.`)
    }
    const insideBlock = projection >= blockBoundaryProjection - tolerance
    const displacedConcreteStress = insideBlock && law.subtractDisplacedConcrete ? law.compressionStress : 0
    const netStress = steelStress - displacedConcreteStress
    const force = bar.area * netStress
    return {
      ...bar,
      projectedDepth,
      strain,
      tensileStrain: Math.max(0, -strain),
      yieldStrain: steelLaw.yieldStrain,
      ultimateStrain: steelLaw.ultimateStrain,
      steelStress,
      displacedConcreteStress,
      netStress,
      force,
      Mx: force * (bar.y - section.referencePoint.y),
      My: -force * (bar.x - section.referencePoint.x),
      insideBlock
    }
  })

  const steelP = bars.reduce((sum, bar) => sum + bar.force, 0)
  const steelMx = bars.reduce((sum, bar) => sum + bar.Mx, 0)
  const steelMy = bars.reduce((sum, bar) => sum + bar.My, 0)
  const resultants = {
    P: concreteForce + steelP,
    Mx: concreteMx + steelMx,
    My: concreteMy + steelMy
  }
  const controlling = bars.reduce<(typeof bars)[number] | undefined>(
    (current, bar) => !current || bar.tensileStrain > current.tensileStrain ? bar : current,
    undefined
  )

  return {
    state: { ...state, blockDepth },
    resultants,
    concrete: {
      ...clipped.moments,
      stress: law.compressionStress,
      force: concreteForce,
      Mx: concreteMx,
      My: concreteMy,
      geometry: clipped.geometry
    },
    bars,
    controllingTensileStrain: controlling?.tensileStrain ?? 0,
    controllingBarId: controlling?.id,
    controllingYieldStrain: controlling?.yieldStrain,
    diagnostics: {
      projectedSectionDepth,
      compressionEdgeProjection,
      neutralAxisProjection,
      blockBoundaryProjection,
      componentForceResidual: resultants.P - concreteForce - steelP,
      componentMomentXResidual: resultants.Mx - concreteMx - steelMx,
      componentMomentYResidual: resultants.My - concreteMy - steelMy
    }
  }
}

/**
 * Reuses the angle-only concrete projection while a surface/fixed-P solver evaluates many depths
 * at the same direction. The exact clipping and every state-dependent quantity remain uncached.
 */
export const bindEquivalentBlockForwardEvaluator = (
  section: PreparedEquivalentBlockSection,
  law: EquivalentBlockLaw,
  steelLaws: SteelLawRegistry
) => {
  let cachedAngle = Number.NaN
  let cachedExtents: ProjectedOuterExtents | undefined
  return (state: BlockSectionState): NominalBlockEvaluation => {
    if (state.neutralAxisAngle !== cachedAngle || cachedExtents === undefined) {
      const normalX = Math.cos(state.neutralAxisAngle)
      const normalY = Math.sin(state.neutralAxisAngle)
      cachedExtents = projectedOuterExtents(section, normalX, normalY)
      cachedAngle = state.neutralAxisAngle
    }
    return evaluateEquivalentBlock(section, law, steelLaws, state, cachedExtents)
  }
}
