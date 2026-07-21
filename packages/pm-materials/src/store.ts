import type { ConcreteMaterial, MaterialStore, SteelMaterial } from './types'

export const updateConcreteMaterial = (
  store: MaterialStore,
  patch: Partial<ConcreteMaterial>
): MaterialStore => ({
  ...store,
  concrete: { ...store.concrete, ...patch, id: store.concrete.id }
})

export const updateSteelMaterial = (
  store: MaterialStore,
  id: number,
  patch: Partial<SteelMaterial>
): MaterialStore => ({
  ...store,
  steel: store.steel.map((material) =>
    material.id === id ? { ...material, ...patch, id: material.id } : material
  )
})

export const addSteelMaterial = (store: MaterialStore, material: SteelMaterial): MaterialStore => ({
  ...store,
  steel: [...store.steel, material],
  defaults: store.defaults.steelMaterialId
    ? store.defaults
    : { ...store.defaults, steelMaterialId: material.id }
})

export const removeSteelMaterial = (store: MaterialStore, id: number): MaterialStore => {
  const steel = store.steel.filter((material) => material.id !== id)
  return {
    ...store,
    steel,
    defaults: {
      ...store.defaults,
      steelMaterialId: store.defaults.steelMaterialId === id ? steel[0]?.id ?? 1 : store.defaults.steelMaterialId
    }
  }
}
