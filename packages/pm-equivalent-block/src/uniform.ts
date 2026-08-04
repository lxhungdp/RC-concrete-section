import {
  EquivalentBlockInputError,
  type PreparedEquivalentBlockSection,
  type SteelLawRegistry,
  type UniformSectionEvaluation,
  type UniformSectionStateOptions
} from './types'

export const evaluateUniformSectionState = (
  section: PreparedEquivalentBlockSection,
  steelLaws: SteelLawRegistry,
  options: UniformSectionStateOptions
): UniformSectionEvaluation => {
  if (
    !Number.isFinite(options.concreteStress) || options.concreteStress < 0 ||
    !Number.isFinite(options.steelStrain)
  ) {
    throw new EquivalentBlockInputError('INVALID_BLOCK_LAW', 'Uniform concrete stress and steel strain must be finite, with nonnegative concrete compression stress.')
  }
  const concreteForce = options.concreteStress * section.grossArea
  const concreteMx = concreteForce * (section.centroid.y - section.referencePoint.y)
  const concreteMy = -concreteForce * (section.centroid.x - section.referencePoint.x)
  const bars = section.rebars.map((bar) => {
    const steelLaw = steelLaws[bar.steelLawId]
    if (!steelLaw) {
      throw new EquivalentBlockInputError('MISSING_STEEL_LAW', `Steel law ${bar.steelLawId} is not registered.`)
    }
    const steelStress = steelLaw.stressAt(options.steelStrain)
    if (!Number.isFinite(steelStress)) {
      throw new EquivalentBlockInputError('INVALID_BLOCK_LAW', `Steel law ${bar.steelLawId} returned a non-finite stress.`)
    }
    const displacedConcreteStress = options.subtractDisplacedConcrete ? options.concreteStress : 0
    const netStress = steelStress - displacedConcreteStress
    const force = bar.area * netStress
    return {
      id: bar.id,
      strain: options.steelStrain,
      steelStress,
      displacedConcreteStress,
      netStress,
      force,
      Mx: force * (bar.y - section.referencePoint.y),
      My: -force * (bar.x - section.referencePoint.x)
    }
  })
  const steelP = bars.reduce((sum, bar) => sum + bar.force, 0)
  const steelMx = bars.reduce((sum, bar) => sum + bar.Mx, 0)
  const steelMy = bars.reduce((sum, bar) => sum + bar.My, 0)
  return {
    resultants: {
      P: concreteForce + steelP,
      Mx: concreteMx + steelMx,
      My: concreteMy + steelMy
    },
    concrete: {
      stress: options.concreteStress,
      force: concreteForce,
      Mx: concreteMx,
      My: concreteMy
    },
    bars
  }
}
