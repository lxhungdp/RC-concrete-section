/**
 * 2D Load Ray and Constant P at the resistance state
 * (docs/task-packets/2026-11-12-resistance-state-angle.md; review items 10 and 12).
 *
 * Oracles:
 * (1) With a hardening strain limit whose εs/εy = 20 station is already clamped at the steel limit,
 *     the capacity state is found for every probe demand, and each state lies on a material limit
 *     (deepest bar at -εud, or extreme concrete at εcu), with P/M on the checked ray. These are
 *     checked from the state's own plane strains, not from the solver's flags. Three of the probes
 *     did not converge with the former fixed 1/3 transition knot.
 * (2) 2026-11-19 convention (2D Load Ray removed): every load-direction curve point, re-evaluated
 *     through the forward station evaluator, has its moment along θ, and the curve crossing of the
 *     proportional ray reproduces the 3D surface ratio within its discretization.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { buildResistanceMaterialSets, createKdsAppendixDesignBasis, createKdsBasicDesignBasis } from '@pm/design'
import { geometryInputRebars, sectionGeometryFromGeometryInput, type GeometryInput } from '@pm/geometry'
import { createKdsConcrete, createKdsRebarSteel, type MaterialStore } from '@pm/materials'
import { analysisMeshKernelOptions, createDefaultAnalysisOptions, type LoadCombination } from '@pm/project'
import {
  buildDemandPmGeometry,
  buildDesignPreviewSurfaceFromPrepared,
  buildExactDirectionCurveFromPrepared,
  checkLoadcaseUtilizationFromSurface,
  createCapacityFieldEvaluator,
  createCapacityStageEvaluator,
  prepareAnalysis
} from '../src/index'
import { solveStressStrainCapacityFieldFromPrepared } from '../src/capacity-field'
import { buildStressStrainLoadDirectionCurveFromPrepared } from '../src/load-direction'

const bars = [[-200, -200], [0, -200], [200, -200], [200, 0], [200, 200], [0, 200], [-200, 200], [-200, 0]]
const geometry: GeometryInput = {
  id: 1,
  name: 'Hardening 500x500',
  outers: [{ id: 1, points: [{ id: 1, x: -250, y: -250 }, { id: 2, x: 250, y: -250 }, { id: 3, x: 250, y: 250 }, { id: 4, x: -250, y: 250 }], holes: [] }],
  rebars: bars.map(([x, y], index) => ({ id: index + 1, steelMaterialId: 1, dia: 25, area: 491, x, y }))
}
const EPS_UD = 0.045
const steel = createKdsRebarSteel({ id: 1, name: 'SD500', fy: 500, elasticModulus: 200000 })
const store: MaterialStore = {
  strainSign: 'compression-positive',
  concrete: createKdsConcrete({ name: 'C30', fck: 30 }),
  // fy/Es = 0.0025, so the εs/εy = 20 station (0.05) is clamped at εud = 0.045.
  steel: [{ ...steel, stressStrain: { type: 'linear-hardening', ultimateStrength: { type: 'ratio', ratio: 1.08 }, epsUk: 0.05,
    strainLimit: { type: 'absolute', value: EPS_UD } } }],
  defaults: { steelMaterialId: 1 }
}
const basis = createKdsBasicDesignBasis()
const options = createDefaultAnalysisOptions()
const prepared = prepareAnalysis(sectionGeometryFromGeometryInput(geometry), geometryInputRebars(geometry),
  buildResistanceMaterialSets(store, basis).stateMaterials, analysisMeshKernelOptions(options))
const surface = buildDesignPreviewSurfaceFromPrepared(prepared, store, basis, options)
const tension = Math.min(...surface.points.map((point) => point.P))
const demand = (fraction: number, mx: number, my = mx * 0.05): LoadCombination =>
  ({ id: 1, name: 'probe', actionBasis: 'factoredULS', P: fraction * tension, Mx: mx, My: my })
const DEG = 180 / Math.PI

test('steel-limited capacity states converge on the hardening transition and lie on a material limit', () => {
  assert.equal(surface.strainDomain, 'steel-limited-ultimate')
  const epsCu = store.concrete.limits.epsCu
  const corners = geometry.outers[0].points
  let steelGoverned = 0
  for (const fraction of [0.2, 0.35, 0.5, 0.65, 0.8]) for (const mx of [20e6, 60e6]) {
    for (const basisId of ['proportional3D', 'constantAxial'] as const) {
      const load = demand(fraction, mx)
      const check = checkLoadcaseUtilizationFromSurface(surface, load, basisId)
      const target = check.codeAdjustedDemand ?? load
      const field = solveStressStrainCapacityFieldFromPrepared(prepared, store, basis, surface, target, basisId)
      assert.equal(field.status, 'available', `${fraction}/${mx}/${basisId}: ${field.status === 'unavailable' ? field.message : ''}`)
      if (field.status !== 'available') continue
      const strain = (x: number, y: number) => field.state.e0 + field.state.kx * y + field.state.ky * x
      const deepestBar = Math.min(...bars.map(([x, y]) => strain(x, y)))
      const extremeConcrete = Math.max(...corners.map((point) => strain(point.x, point.y)))
      const onSteel = Math.abs(deepestBar + EPS_UD) <= 1e-7
      const onConcrete = Math.abs(extremeConcrete - epsCu) <= 1e-7
      assert.ok(onSteel || onConcrete, `${fraction}/${mx}/${basisId}: εs,min ${deepestBar}, εc,max ${extremeConcrete}`)
      if (onSteel) steelGoverned += 1
      // The state lies on the checked load path.
      const m = Math.hypot(field.response.Mx, field.response.My), md = Math.hypot(target.Mx, target.My)
      if (basisId === 'constantAxial') assert.ok(Math.abs(field.response.P - target.P) <= 1e-6 * Math.abs(tension))
      else assert.ok(Math.abs(field.response.P / m - target.P / md) <= 1e-6 * Math.abs(target.P / md))
    }
  }
  assert.ok(steelGoverned >= 5, `steel-limited probes ${steelGoverned}`)
})

test('2026-11-19: the load-direction curve passes the 3D strength point and every point points along θ', () => {
  const loads = [demand(0.5, 60e6), demand(-1.5, 120e6, 80e6), demand(-3, 40e6, -150e6), demand(0.2, 20e6)]
  const tensionPole = surface.nominalPoints.find((point) => point.surfaceRole === 'pure-tension')
  assert.ok(tensionPole)
  const evaluate = createCapacityFieldEvaluator(prepared, store, basis, tensionPole.state.e0)
  for (const load of loads) {
    const theta = Math.atan2(load.My, load.Mx)
    const curve = buildStressStrainLoadDirectionCurveFromPrepared(prepared, store, basis, surface, theta)
    assert.deepEqual(curve.unresolved, [], `${load.P}: every crossing resolves`)
    assert.deepEqual(curve.discontinuities, [], `${load.P}: the fibre families are continuous`)
    const definition = (id: string) => {
      const station = surface.stations.find((item) => item.id === id)
      assert.ok(station, id)
      return station.definition
    }
    // Independent residual oracle: re-evaluate each physical point through the forward evaluator from
    // its own β and station identity (or the interpolated definition of its two stations).
    let physical = 0
    for (const point of curve.designPaths.flat()) {
      if (point.role !== 'physical-station' && point.role !== 'between-stations') continue
      physical += 1
      assert.ok(point.beta !== null)
      const stationDefinition = point.role === 'physical-station'
        ? definition(point.stationId!)
        : { kind: 'adaptive-state-interpolation' as const, left: definition(point.between!.from),
            right: definition(point.between!.to), ratio: point.between!.fraction }
      const state = evaluate(point.beta, stationDefinition, 0).point
      const magnitude = Math.hypot(state.Mx, state.My)
      assert.ok(Math.abs((state.My * Math.cos(theta) - state.Mx * Math.sin(theta)) / magnitude) <= 1e-9)
      assert.ok(state.Mx * Math.cos(theta) + state.My * Math.sin(theta) > 0)
      assert.ok(Math.abs(state.P - point.P) <= 1e-9 * Math.max(1, Math.abs(state.P)))
    }
    assert.ok(physical > 10, `${load.P}: the curve is made of physical states`)
    assert.ok(curve.designPaths.flat().every((point) => point.role !== 'interpolated'))
    // The curve crossing reproduces the governing 3D surface ratio within its discretization.
    const threeD = checkLoadcaseUtilizationFromSurface(surface, load)
    const geometry = buildDemandPmGeometry({ surface, curve, demand: load, governingPoint: threeD.capacityPoint, basis: 'proportional3D' })
    assert.ok(geometry.summary.status === 'available' && threeD.utilization !== null)
    assert.ok(Math.abs(geometry.summary.utilization / threeD.utilization - 1) < 0.015,
      `${load.P}: curve ${geometry.summary.utilization} vs 3D ${threeD.utilization}`)
    // Each point carries its own β; they are not one meridian.
    const betas = curve.designPaths.flat().flatMap((point) => point.beta === null ? [] : [point.beta])
    assert.ok(Math.max(...betas) - Math.min(...betas) > 1e-3 || Math.abs(load.My / load.Mx) < 1e-12)
  }
})

test('2026-11-19: a zero-moment demand has no load direction and no curve', () => {
  const load = { ...demand(0.5, 0, 0) }
  const geometry = buildDemandPmGeometry({ surface, curve: null, demand: load, governingPoint: null, basis: 'proportional3D' })
  assert.equal(geometry.curveStatus, 'zero-moment')
  assert.equal(geometry.theta, null)
  assert.deepEqual(geometry.design, [])
})

test('2026-11-19: on a principal axis of a doubly symmetric section the curve is the exact meridian', () => {
  // Differential oracle: by symmetry the principal-axis meridian (β = θ) has its moment along θ, so
  // every station point of the curve must reproduce that meridian's station state. The fibre mesh is
  // symmetric only to its triangulation: each meridian point m points ε_m off θ, and the exact root then
  // sits that far along the ring. The curve point must therefore agree within 2·ε_m + 1e-8 of the
  // section scales; any real projection error is far larger.
  for (const theta of [0, Math.PI / 2]) {
    const curve = buildStressStrainLoadDirectionCurveFromPrepared(prepared, store, basis, surface, theta)
    assert.deepEqual(curve.unresolved, [])
    const exact = buildExactDirectionCurveFromPrepared(prepared, store, basis, options, theta)
    const meridian = exact.beforeAxialCap ?? exact.designCurve ?? exact.designAdaptive
    const forceScale = Math.max(...meridian.map((item) => Math.abs(item.P)))
    const momentScale = Math.max(...meridian.map((item) => Math.hypot(item.Mx, item.My)))
    let matched = 0
    for (const point of curve.designPaths.flat().filter((item) => item.role === 'physical-station')) {
      const match = meridian.find((item) => item.stationId === point.stationId)
      assert.ok(match, `${theta}: ${point.stationId} is on the exact meridian`)
      matched += 1
      const asymmetry = Math.abs(match.My * Math.cos(theta) - match.Mx * Math.sin(theta)) / Math.hypot(match.Mx, match.My)
      assert.ok(asymmetry < 1e-3, `${theta} ${point.stationId}: mesh asymmetry ${asymmetry}`)
      const bound = 2 * asymmetry + 1e-8
      assert.ok(Math.abs(match.P - point.P) <= bound * forceScale, `${theta} ${point.stationId}: P`)
      assert.ok(Math.hypot(match.Mx - point.Mx, match.My - point.My) <= bound * momentScale, `${theta} ${point.stationId}: M`)
    }
    assert.ok(matched > 10)
  }
})

test('2026-11-19: the load-direction stage evaluator reproduces the field evaluator bit for bit', () => {
  // One integration per stage for design materials, one for both stages with a global factor; the
  // resultants and the Design resistance evidence must be exactly those of the field evaluator.
  const tensionPoleStrain = surface.nominalPoints.find((point) => point.surfaceRole === 'pure-tension')!.state.e0
  for (const stageBasis of [createKdsAppendixDesignBasis(), createKdsBasicDesignBasis()]) {
    const statePrepared = prepareAnalysis(sectionGeometryFromGeometryInput(geometry), geometryInputRebars(geometry),
      buildResistanceMaterialSets(store, stageBasis).stateMaterials, analysisMeshKernelOptions(options))
    const field = createCapacityFieldEvaluator(statePrepared, store, stageBasis, tensionPoleStrain)
    const stage = createCapacityStageEvaluator(statePrepared, store, stageBasis, tensionPoleStrain)
    assert.equal(stage.separateStages, stageBasis.format !== 'globalResultantFactor')
    for (const station of surface.stations) for (const beta of [0.2, 1.7, 3.9, 5.6]) {
      const reference = field(beta, station.definition, 0)
      const design = stage.separateStages ? stage.stage(beta, station.definition, 'design') : stage.both(beta, station.definition, 0).design
      const nominal = stage.separateStages ? stage.stage(beta, station.definition, 'nominal') : stage.both(beta, station.definition, 0).nominal
      for (const [actual, expected] of [[design, reference.point], [nominal, reference.nominal]] as const) {
        assert.deepEqual([actual.P, actual.Mx, actual.My], [expected.P, expected.Mx, expected.My], station.id)
      }
      assert.deepEqual(design.resistance, reference.point.resistance)
    }
  }
})
