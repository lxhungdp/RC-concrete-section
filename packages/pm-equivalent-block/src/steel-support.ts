import { prepareGroupedPointSupports } from '@pm/geometry'
import { EquivalentBlockInputError, type PreparedEquivalentBlockSection, type SteelLawRegistry } from './types'

/** One deepest tensile candidate per material and direction for all depth iterations. */
export const prepareSteelDepthSupports = (section: PreparedEquivalentBlockSection, laws?: SteelLawRegistry) => {
  const supports = prepareGroupedPointSupports(section.rebars.map((bar, order) => ({ ...bar, order })), (bar) => bar.steelLawId)
  return (normalX: number, normalY: number, compressionEdge: number) => laws
    ? supports(normalX, normalY).map((group) => {
        const bar = group.minimum
        const law = laws[bar.steelLawId]
        if (!law) throw new EquivalentBlockInputError('MISSING_STEEL_LAW', `Steel law ${bar.steelLawId} is not registered.`)
        return {
          depth: compressionEdge - (normalX * bar.x + normalY * bar.y),
          order: bar.order,
          yieldStrain: law.yieldStrain,
          ultimateStrain: law.ultimateStrain
        }
      })
    : undefined
}
