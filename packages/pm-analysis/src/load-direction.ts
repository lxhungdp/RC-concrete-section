import type { MaterialStore } from '@pm/materials'
import type { DesignBasis } from '@pm/design'
import { activeDesignSurfaceDataset, activeNominalSurfaceDataset } from '@pm/results/audit'
import {
  edgeBeta,
  projectLoadDirectionCut,
  type LoadDirectionMechanics,
  type LoadDirectionParametrisation
} from '@pm/results/load-direction'

export type { LoadDirectionMechanics, LoadDirectionSurfaceEntry } from '@pm/results/load-direction'
export { loadDirectionSurfacePoints } from '@pm/results/load-direction'
import type { DesignResistanceTrace, ResultantLedger, LoadDirectionCurve, PreviewSurfaceDataset, Resultant, StationDefinition, StrainState } from '@pm/results/contracts'
import { createCapacityStageEvaluator, sliceMomentPlane, type PreparedAnalysis, type PreviewSurface } from './index'

/**
 * engineering/05 §3, root 05 §8: Demand P–M curve in the vertical plane of θ for any mechanics. The
 * Design curve is cut from the original reduced geometry and clipped at the axial cap afterwards; the
 * Nominal curve is cut from the nominal dataset. Every crossing is moved onto the physical surface by
 * the mechanics' own edge parametrisation.
 */
export const buildLoadDirectionCurve = (
  surface: PreviewSurface,
  theta: number,
  mechanics: LoadDirectionMechanics
): LoadDirectionCurve => {
  if (!Number.isFinite(theta)) throw new RangeError('The load direction θ must be finite.')
  const designSource: PreviewSurfaceDataset = surface.beforeAxialCap ?? activeDesignSurfaceDataset(surface)
  const nominalSource = activeNominalSurfaceDataset(surface)
  return projectLoadDirectionCut({
    theta,
    design: { paths: sliceMomentPlane(designSource.points, theta, designSource.triangles), parametrise: mechanics.design },
    nominal: { paths: sliceMomentPlane(nominalSource.points, theta, nominalSource.triangles), parametrise: mechanics.nominal },
    cap: surface.beforeAxialCap ? surface.bounds.P[1] : null
  })
}

/**
 * Stress–strain edge families. On a station ring β moves along the short arc with the station's own
 * definition; across stations the definition is the adaptive state interpolation of the two station
 * definitions (root 05 §2.3) at the interpolated β, so every point is a compatible ultimate state of
 * the same station-state rule and Design-resistance evaluator as the surface.
 */
export const createStressStrainLoadDirectionMechanics = (
  prepared: PreparedAnalysis,
  sourceMaterials: MaterialStore,
  basis: DesignBasis,
  surface: PreviewSurface
): LoadDirectionMechanics => {
  if (surface.analysisOptions.methodId !== 'strain-domain-surface-v1') throw new TypeError('Expected stress-strain analysis options.')
  const tensionPole = surface.nominalPoints.find((point) => point.surfaceRole === 'pure-tension')
  if (!tensionPole) throw new RangeError('The surface has no pure-tension pole.')
  const evaluator = createCapacityStageEvaluator(prepared, sourceMaterials, basis, tensionPole.state.e0)
  const definitions = new Map<string, StationDefinition>(surface.stations.map((station) => [station.id, station.definition]))
  type StageValue = Resultant & { state: StrainState; ledger: ResultantLedger; resistance?: DesignResistanceTrace }
  // Memoised by the exact evaluation inputs (β and station definition; the station coordinate is a
  // display index only), so a vertex shared by several edges is evaluated once. With a global
  // resultant factor one integration serves both stages, so a root shared by Design and Nominal is
  // evaluated once too; with design materials each stage integrates only itself.
  const memo = new Map<string, { design: StageValue; nominal: StageValue } | StageValue>()
  const MEMO_LIMIT = 20_000
  const remember = <T extends object>(memoKey: string, compute: () => T): T => {
    const cached = memo.get(memoKey)
    if (cached) return cached as T
    const value = compute()
    if (memo.size >= MEMO_LIMIT) memo.clear()
    memo.set(memoKey, value as never)
    return value
  }
  const evaluate = (beta: number, definition: StationDefinition, key: string, coordinate: number, stage: 'design' | 'nominal'): StageValue =>
    evaluator.separateStages
      ? remember(`${stage}|${beta}|${key}`, () => evaluator.stage(beta, definition, stage))
      : remember(`both|${beta}|${key}`, () => evaluator.both(beta, definition, coordinate))[stage]
  const parametrisation = (stage: 'design' | 'nominal'): LoadDirectionParametrisation => (a, b) => {
    if (a.stationId === null || b.stationId === null) return null
    const left = definitions.get(a.stationId)
    const right = definitions.get(b.stationId)
    if (!left || !right) return null
    const same = a.stationId === b.stationId
    return (tau) => {
      const beta = edgeBeta(a, b, tau)
      const interpolated = !(same || tau === 0 || tau === 1)
      const definition: StationDefinition = same || tau === 0 ? left : tau === 1 ? right
        : { kind: 'adaptive-state-interpolation', left, right, ratio: tau }
      const key = !interpolated ? (same || tau === 0 ? a.stationId! : b.stationId!) : `${a.stationId}>${b.stationId}@${tau}`
      const value = evaluate(beta, definition, key, a.station + tau * (b.station - a.station), stage)
      // `resistance` is read through, so lazily built evidence is built only for an accepted root.
      return {
        P: value.P, Mx: value.Mx, My: value.My, beta,
        state: value.state,
        ledger: value.ledger,
        get resistance() { return value.resistance }
      }
    }
  }
  return { design: parametrisation('design'), nominal: parametrisation('nominal') }
}

/** Stress–strain load-direction curve of a completed surface. */
export const buildStressStrainLoadDirectionCurveFromPrepared = (
  prepared: PreparedAnalysis,
  sourceMaterials: MaterialStore,
  basis: DesignBasis,
  surface: PreviewSurface,
  theta: number
): LoadDirectionCurve =>
  buildLoadDirectionCurve(surface, theta, createStressStrainLoadDirectionMechanics(prepared, sourceMaterials, basis, surface))
