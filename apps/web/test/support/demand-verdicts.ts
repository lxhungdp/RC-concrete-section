import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { geometryInputRebars, sectionGeometryFromGeometryInput } from '@pm/geometry'
import { createKdsAppendixDesignBasis, withSteelModelModification } from '@pm/design'
import {
  CALCULATION_PROFILES,
  applyCalculationProfileToMaterials,
  createAdaptiveAnalysisOptions,
  createAdaptiveEquivalentBlockAnalysisOptions,
  createAnalysisOptionsForProfile,
  createDesignBasisForCalculationProfile,
  createLoadCombination,
  isEquivalentBlockProfileId,
  parseProjectDocument,
  type CalculationProfileId,
  type DemandCheckBasis
} from '@pm/project'
import { checkLoadcaseUtilizationFromSurface, type PreviewSurface } from '@pm/analysis'

export type VerdictRoute = { profileId: CalculationProfileId; appendix: boolean; hardening?: boolean }
export const verdictRoutes: VerdictRoute[] = CALCULATION_PROFILES.flatMap((profile) => [
  { profileId: profile.id, appendix: false },
  ...(profile.allowedDesignProfileIds?.includes('kds-142020-2022-appendix-material-factors')
    ? [{ profileId: profile.id, appendix: true }] : [])
])
export const finiteSteelRoutes: VerdictRoute[] = verdictRoutes.filter((route) =>
  route.profileId === 'kds-2024-stress-strain' || route.profileId === 'en-1992-1-1-2004-stress-strain' ||
  route.profileId === 'custom-stress-strain' || route.profileId === 'kds-142020-equivalent-block'
).map((route) => ({ ...route, hardening: true }))

export const verdictShapes = [
  'KDS-EB-01-rectangle-8-bars', 'KDS-EB-02-hollow-8-bars',
  'KDS-EB-03-l-shape-8-bars', 'KDS-EB-04-two-islands-8-bars'
] as const
export type VerdictShape = typeof verdictShapes[number]
export const routeName = (route: VerdictRoute) =>
  `${route.profileId}${route.appendix ? '/appendix' : ''}${route.hardening ? '/hardening' : ''}`

export const verdictInput = (route: VerdictRoute, mode: 'fixed' | 'adaptive', shape: VerdictShape = verdictShapes[0]) => {
  const parsed = parseProjectDocument(readFileSync(`docs/examples/equivalent-block/${shape}.pm-project.json`, 'utf8'))
  assert.ok(parsed.ok)
  const { geometry } = parsed.document.inputs
  const materialStore = applyCalculationProfileToMaterials(parsed.document.inputs.materials, route.profileId)
  if (route.hardening) {
    // Declared verification fixture, not a normative material default.
    materialStore.steel = materialStore.steel.map((steel) => ({ ...steel,
      stressStrain: { type: 'linear-hardening', epsUk: 0.05,
        ultimateStrength: { type: 'ratio', ratio: 1.08 }, strainLimit: { type: 'factor', value: 1 } }
    }))
  }
  const designBasis = withSteelModelModification(route.appendix ? createKdsAppendixDesignBasis() :
    createDesignBasisForCalculationProfile(route.profileId), materialStore)
  const analysisOptions = mode === 'fixed' ? createAnalysisOptionsForProfile(route.profileId) :
    isEquivalentBlockProfileId(route.profileId) ? createAdaptiveEquivalentBlockAnalysisOptions() : createAdaptiveAnalysisOptions()
  return { geometry, section: sectionGeometryFromGeometryInput(geometry), rebars: geometryInputRebars(geometry),
    calculationProfileId: route.profileId, materialStore, designBasis, analysisOptions }
}

/** One independent boundary-scaling fixture for either declared load path. */
export const boundaryScaledLoads = (surface: PreviewSurface, basis: DemandCheckBasis,
  ratios: readonly number[] = [0.91, 0.975, 1, 1.025, 1.1], fraction = 0.6, theta = Math.atan2(1, 3)) => {
  const P = surface.bounds.P[0] + fraction * (surface.bounds.P[1] - surface.bounds.P[0])
  const seed = createLoadCombination({ P, Mx: 1e6 * Math.cos(theta), My: 1e6 * Math.sin(theta) })
  const reference = checkLoadcaseUtilizationFromSurface(surface, seed, basis)
  assert.ok(reference.capacityPoint, `${basis}: ${reference.message}`)
  const boundary = reference.capacityPoint
  return ratios.map((ratio, index) => createLoadCombination({ id: index + 1, name: `UR ${ratio}`,
    P: basis === 'proportional3D' ? boundary.P * ratio : P,
    Mx: boundary.Mx * ratio, My: boundary.My * ratio }))
}

/** Requirement oracle in demand/capacity space, independent of the implementation's divisions. */
export const intervalVerdict = (ur: number | null, uncertainty: number | null) =>
  ur === null || !Number.isFinite(ur) || ur < 0 || uncertainty === null || !Number.isFinite(uncertainty) ||
    uncertainty < 0 || uncertainty >= 1 ? 'indeterminate' :
    ur <= 1 - uncertainty ? 'adequate' : ur > 1 + uncertainty ? 'inadequate' : 'indeterminate'
