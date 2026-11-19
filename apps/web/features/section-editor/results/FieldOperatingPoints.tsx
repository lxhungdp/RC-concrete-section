'use client'

import { useEffect, useMemo, useState } from 'react'
import { buildResistanceMaterialSets, type DesignBasis } from '@pm/design'
import {
  compileConcreteMaterial,
  compileSteelMaterial,
  describeConcreteMaterialLaw,
  type MaterialStore
} from '@pm/materials'
import type { SectionFieldMap, SectionFieldSummary } from '@pm/analysis'
import { useQuantityFormatters } from '../shared/DisplayUnits'
import { MaterialCurveFrame, MATERIAL_CURVE_FRAME, spacedTicks } from '../materials/MaterialCurveFrame'
import { MaterialSymbol } from '../materials/MaterialSymbol'
import type { CalculationProfileId } from '@pm/project'
import {
  CONCRETE_MARKS,
  lawMarks,
  operatingStrainRange,
  steelLawMarks,
  type OperatingMark as Mark
} from './operating-chart-marks'

const frame = MATERIAL_CURVE_FRAME
type Point = { strain: number; stress: number; kind: 'max' | 'min'; id?: number }

/**
 * σ–ε operating points of a displayed stress-strain field (2026-11-09 review item 1). The curves are
 * the state material laws that produced the field map's stresses, so every point lies on its law.
 * Signed axes, compression positive. An equivalent-block field has no concrete fibre law: its concrete
 * view is the block stress view of the analysis adapter, beside the rebar law with its bar points.
 */
function OperatingChart({ label, curve, points, marks = [], symbol, strainSymbol }: {
  label: string
  curve: (strain: number) => number
  points: Point[]
  marks?: Mark[]
  symbol: 'sigmaC' | 'sigmaS'
  strainSymbol: 'epsC' | 'epsS'
}) {
  const { qfmt, unit } = useQuantityFormatters()
  const view = useMemo(() => {
    // Widen to the law's characteristic strains on each side that carries an operating point.
    const { lo, hi } = operatingStrainRange(points.map((point) => point.strain), marks)
    const shownMarks = marks.filter((mark) => mark.strain >= lo && mark.strain <= hi && mark.strain !== 0)
      .map((mark) => ({ ...mark, stress: curve(mark.strain) }))
    // Uniform samples plus both sides of every characteristic strain, so kinks and the block's
    // stress jumps are drawn at their exact strain.
    const kinks = shownMarks.flatMap((mark) => [mark.strain * (1 - 1e-9), mark.strain * (1 + 1e-9)])
    const samples = [...Array.from({ length: 121 }, (_, index) => lo + (hi - lo) * index / 120), ...kinks]
      .filter((strain) => strain >= lo && strain <= hi).sort((left, right) => left - right)
      .map((strain) => ({ strain, stress: curve(strain) }))
    const stresses = [...samples, ...points, ...shownMarks].map((point) => point.stress)
    const sLo = Math.min(0, ...stresses), sHi = Math.max(0, ...stresses)
    const span = Math.max(1e-9, sHi - sLo), eSpan = Math.max(1e-12, hi - lo)
    const x = (strain: number) => frame.left + (strain - lo) / eSpan * (frame.right - frame.left)
    const y = (stress: number) => frame.bottom - (stress - sLo) / span * (frame.bottom - frame.top - 8)
    return {
      path: samples.map((point, index) => `${index ? 'L' : 'M'} ${x(point.strain).toFixed(2)} ${y(point.stress).toFixed(2)}`).join(' '),
      origin: { x: x(0), y: y(0) },
      points: points.map((point) => ({ ...point, cx: x(point.strain), cy: y(point.stress) })),
      marks: shownMarks.map((mark) => ({ ...mark, cx: x(mark.strain), cy: y(mark.stress) })),
      // Every characteristic strain is listed in the notes, also one outside the plotted range.
      noteMarks: marks.map((mark) => ({ ...mark, stress: curve(mark.strain) })),
      // Operating points take tick priority; a characteristic value is kept where it does not collide.
      xTicks: spacedTicks([...points, ...shownMarks].map((point) => ({ at: x(point.strain), label: point.strain.toFixed(5) })), 40),
      yTicks: spacedTicks([...points, ...shownMarks].map((point) => ({ at: y(point.stress), label: qfmt('stress', point.stress, 0) })), 10)
    }
  }, [curve, marks, points, qfmt])
  const sub = strainSymbol === 'epsS' ? 's' : 'c'
  return <div className="pm-material-curve pm-field-operating-chart">
    <MaterialCurveFrame label={label} originX={view.origin.x} originY={view.origin.y}
      stressLabel={<><MaterialSymbol symbol={symbol} svg /> ({unit('stress')})</>}
      strainLabel={<MaterialSymbol symbol={strainSymbol} svg />}
      xTicks={view.xTicks} yTicks={view.yTicks}>
      <path d={view.path} />
      {/* Dashed guides from each extreme point to the strain and stress axes, where its values are read. */}
      <g className="pm-field-operating-guides" aria-hidden="true">
        {[...view.marks.map((mark) => ({ ...mark, kind: 'mark' as const })), ...view.points].map((point, index) =>
          <g key={index} className={point.kind === 'mark' ? 'is-mark' : undefined}>
            <line x1={point.cx} y1={point.cy} x2={point.cx} y2={frame.bottom} />
            <line x1={point.cx} y1={point.cy} x2={frame.left} y2={point.cy} />
          </g>)}
      </g>
      <g className="pm-field-operating-marks">
        {view.marks.map((mark) => <g key={mark.label}>
          <circle cx={mark.cx} cy={mark.cy} r={2.6}>
            <title>{mark.label} = {mark.strain.toPrecision(4)}, σ = {qfmt('stress', mark.stress, 2)} {unit('stress')}</title>
          </circle>
        </g>)}
      </g>
      {view.points.map((point, index) => <circle key={index} cx={point.cx} cy={point.cy}
        r={3} className={`pm-field-operating-point is-${point.kind}`}>
        <title>{point.id === undefined ? '' : `Bar ${point.id}: `}ε = {point.strain.toPrecision(5)}, σ = {qfmt('stress', point.stress, 2)} {unit('stress')}</title>
      </circle>)}
    </MaterialCurveFrame>
    {/* Values beside the chart, not on it: the operating extremes, then the law's characteristic points. */}
    <table className="pm-field-operating-notes" aria-label={`${label} values`}>
      <thead><tr><th scope="col" /><th scope="col">ε</th><th scope="col">σ ({unit('stress')})</th></tr></thead>
      <tbody>
        {view.points.map((point) => <tr key={point.kind} className="is-operating">
          <th scope="row">ε<sub>{sub},{point.kind}</sub>{point.id === undefined ? null : <em className="pm-bar-id"> id {point.id}</em>}</th>
          <td className="ws-num">{point.strain.toFixed(5)}</td>
          <td className="ws-num">{qfmt('stress', point.stress, 1)}</td>
        </tr>)}
        {view.noteMarks.map((mark) => <tr key={mark.label}>
          <th scope="row">{mark.label}</th>
          <td className="ws-num">{mark.strain.toFixed(5)}</td>
          <td className="ws-num">{qfmt('stress', mark.stress, 1)}</td>
        </tr>)}
      </tbody>
    </table>
  </div>
}

type BlockLaw = { depthFactor: number; extremeCompressionStrain: number; compressionStress: number }

/**
 * Equivalent-block concrete view in the same chart role as the fibre laws: the Design block of the
 * analysis adapter (`resolveEquivalentBlockLaws`, as in Materials) over a linear strain profile,
 * σc = σblock for (1 − β1)·εcu ≤ ε ≤ εcu, with the field's concrete strain extremes on it.
 */
function BlockOperatingChart({ profileId, store, basis, maxStrain, minStrain }: {
  profileId: CalculationProfileId
  store: MaterialStore
  basis: DesignBasis
  maxStrain: number
  minStrain: number
}) {
  const [law, setLaw] = useState<{ value: BlockLaw | null; error: string }>({ value: null, error: '' })
  useEffect(() => {
    let current = true
    import('@pm/analysis-equivalent-block').then(({ resolveEquivalentBlockLaws }) => {
      if (!current) return
      try {
        setLaw({ value: resolveEquivalentBlockLaws(profileId, store, basis).design, error: '' })
      } catch (error) {
        setLaw({ value: null, error: error instanceof Error ? error.message : 'The block law is unavailable.' })
      }
    }, () => { if (current) setLaw({ value: null, error: 'The block law could not be loaded.' }) })
    return () => { current = false }
  }, [profileId, store, basis])
  const chart = useMemo(() => {
    if (!law.value) return null
    const { depthFactor, extremeCompressionStrain: epsCu, compressionStress } = law.value
    const start = (1 - depthFactor) * epsCu
    const curve = (strain: number) => strain >= start && strain <= epsCu ? compressionStress : 0
    const marks: Mark[] = [
      { strain: start, label: '(1−β1)εcu', extend: true },
      { strain: epsCu, label: 'εcu', extend: true }
    ]
    const points: Point[] = [
      { strain: maxStrain, stress: curve(maxStrain), kind: 'max' },
      { strain: minStrain, stress: curve(minStrain), kind: 'min' }
    ]
    return { curve, marks, points }
  }, [law.value, maxStrain, minStrain])
  if (!chart) return <p className="pm-preview-hint" role="status">{law.error || 'Resolving the block law…'}</p>
  return <OperatingChart label="Concrete block operating points" curve={chart.curve} points={chart.points}
    marks={chart.marks} symbol="sigmaC" strainSymbol="epsC" />
}

export function FieldOperatingPoints({ fieldMap, summary, materialStore, designBasis, profileId }: {
  fieldMap: SectionFieldMap
  summary: SectionFieldSummary
  materialStore: MaterialStore
  designBasis: DesignBasis
  profileId: CalculationProfileId
}) {
  const laws = useMemo(() => {
    try {
      const state = buildResistanceMaterialSets(materialStore, designBasis).stateMaterials
      const concrete = compileConcreteMaterial(state.concrete)
      const steel = new Map(state.steel.map((material) => [material.id, compileSteelMaterial(material)]))
      const defaultSteel = state.defaults.steelMaterialId
      const steelMaterial = state.steel.find((material) => material.id === defaultSteel)
      const steelLimits = steel.get(defaultSteel)?.limits
      return {
        concrete, steel, defaultSteel, error: '',
        concreteMarks: lawMarks(describeConcreteMaterialLaw(state.concrete), CONCRETE_MARKS, [1], {}),
        steelMarks: steelMaterial ? steelLawMarks(steelMaterial, steelLimits) : []
      }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'The material laws are unavailable.' }
    }
  }, [materialStore, designBasis])
  if (!('concrete' in laws) || !laws.concrete) return <p className="pm-preview-hint" role="status">{laws.error}</p>
  const concreteLaw = laws.concrete
  const concretePoints: Point[] = [
    { strain: summary.concrete.maxStrain, stress: concreteLaw.stress(summary.concrete.maxStrain), kind: 'max' },
    { strain: summary.concrete.minStrain, stress: concreteLaw.stress(summary.concrete.minStrain), kind: 'min' }
  ]
  const block = Boolean(fieldMap.equivalentBlock)
  const steelId = laws.defaultSteel
  const steelLaw = laws.steel.get(steelId)
  const rebar = summary.rebar
  // Only the extreme bars (εs,max and εs,min, the ids listed in the detail pane); every other bar lies
  // on the same law between them, so drawing all of them adds no information.
  const barPoints: Point[] = (['max', 'min'] as const).flatMap((kind) => {
    const id = kind === 'max' ? rebar?.maxStrain.barId : rebar?.minStrain.barId
    const bar = fieldMap.rebars.find((candidate) => candidate.id === id)
    return bar ? [{ strain: bar.strain, stress: bar.stress, kind, id: bar.id }] : []
  })
  return <div className="pm-field-operating-points" data-text-group>
    {block
      ? <BlockOperatingChart profileId={profileId} store={materialStore} basis={designBasis}
        maxStrain={summary.concrete.maxStrain} minStrain={summary.concrete.minStrain} />
      : <OperatingChart label="Concrete operating points" curve={concreteLaw.stress} points={concretePoints}
        marks={laws.concreteMarks} symbol="sigmaC" strainSymbol="epsC" />}
    {steelLaw && barPoints.length > 0 && <OperatingChart label="Rebar operating points" curve={steelLaw.stress}
      points={barPoints} marks={laws.steelMarks} symbol="sigmaS" strainSymbol="epsS" />}
    {laws.steel.size > 1 && <p className="pm-preview-hint">The rebar curve is steel material {steelId}; bars of other materials keep their own law.</p>}
  </div>
}
