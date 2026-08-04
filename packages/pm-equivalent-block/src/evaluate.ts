import { clipPreparedSectionToHalfPlane } from './geometry'
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
  return {
    yieldStrain,
    ultimateStrain,
    stressAt: (strain) => Math.max(-yieldStress, Math.min(yieldStress, elasticModulus * strain))
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
  state: BlockSectionState
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
  const projections = section.solids.flatMap((solid) => solid.outer.map((point) => normalX * point.x + normalY * point.y))
  const compressionEdgeProjection = Math.max(...projections)
  const tensionEdgeProjection = Math.min(...projections)
  const projectedSectionDepth = compressionEdgeProjection - tensionEdgeProjection
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
      forceClosure: resultants.P - concreteForce - steelP,
      momentXClosure: resultants.Mx - concreteMx - steelMx,
      momentYClosure: resultants.My - concreteMy - steelMy
    }
  }
}
