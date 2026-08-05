import { compileAciWhitneyConcrete } from './concrete/aci-whitney'
import { compileAs3600BlockConcrete } from './concrete/as3600-block'
import { compileEc2ParabolicRectangularConcrete } from './concrete/ec2-parabolic-rectangular'
import { compileKdsParabolicConcrete } from './concrete/kds-parabolic'
import { compileUserBlockConcrete } from './concrete/user-block'
import { compileBilinearSteel } from './steel/bilinear'
import { compileElasticPerfectlyPlasticSteel } from './steel/elastic-perfectly-plastic'
import { compileConcreteUserCurve, compileSteelUserCurve } from './user-curve'
import type { CompiledMaterial, ConcreteMaterial, MaterialDefinition, MaterialStore, SteelMaterial } from './types'

export const isConcreteMaterial = (material: MaterialDefinition): material is ConcreteMaterial =>
  'fck' in material

export const isSteelMaterial = (material: MaterialDefinition): material is SteelMaterial =>
  'fy' in material && 'elasticModulus' in material

export const compileConcreteMaterial = (material: ConcreteMaterial): CompiledMaterial => {
  switch (material.stressStrain.type) {
    case 'kds-parabolic':
      return compileKdsParabolicConcrete(material)
    case 'aci-whitney-block':
      return compileAciWhitneyConcrete(material)
    case 'as3600-equivalent-block':
      return compileAs3600BlockConcrete(material)
    case 'user-block':
      return compileUserBlockConcrete(material)
    case 'ec2-parabolic-rectangular':
      return compileEc2ParabolicRectangularConcrete(material)
    case 'user-curve':
      return compileConcreteUserCurve(material)
    default:
      return compileKdsParabolicConcrete(material)
  }
}

export const compileSteelMaterial = (material: SteelMaterial): CompiledMaterial => {
  switch (material.stressStrain.type) {
    case 'bilinear':
      return compileBilinearSteel(material)
    case 'user-curve':
      return compileSteelUserCurve(material)
    case 'elastic-perfectly-plastic':
    default:
      return compileElasticPerfectlyPlasticSteel(material)
  }
}

export const compileMaterial = (material: MaterialDefinition): CompiledMaterial =>
  isConcreteMaterial(material) ? compileConcreteMaterial(material) : compileSteelMaterial(material)

export const compileMaterialStore = (store: MaterialStore) => ({
  concrete: compileConcreteMaterial(store.concrete),
  steel: new Map(store.steel.map((material) => [material.id, compileSteelMaterial(material)]))
})
