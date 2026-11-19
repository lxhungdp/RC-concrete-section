'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { buildResistanceMaterialSets, type DesignBasis } from '@pm/design'
import { compileConcreteMaterial, type MaterialStore } from '@pm/materials'
import type { CalculationProfileId } from '@pm/project'
import { useQuantityFormatters } from '../shared/DisplayUnits'
import { MaterialSymbol } from './MaterialSymbol'
import { MaterialCurveFrame, MATERIAL_CURVE_FRAME, spacedTicks } from './MaterialCurveFrame'

const frame = MATERIAL_CURVE_FRAME
const strainText = (strain: number) => strain.toFixed(4)

/**
 * Concrete σ–ε chart (2026-11-09 review item 1). The design law is solid; the reference law is
 * dashed where it differs (a material-factor route). Both are evaluated by the material owner from
 * the resistance material sets; no constitutive formula is written here. Compression positive.
 */
export function ConcreteStressStrainCurve({ store, basis, caption }: {
  store: MaterialStore
  basis: DesignBasis
  caption: ReactNode
}) {
  const { qfmt, unit } = useQuantityFormatters()
  const preview = useMemo(() => {
    try {
      const sets = buildResistanceMaterialSets(store, basis)
      const laws = [sets.designMaterials.concrete, sets.referenceMaterials.concrete].map((material) => {
        const law = compileConcreteMaterial(material)
        return { law, end: Math.max(1e-4, law.limits.epsCompressionUltimate ?? material.limits.epsCu), peakStrain: material.limits.eps0 }
      })
      const extent = Math.max(...laws.map((item) => item.end))
      const samples = laws.map(({ law, end }) => Array.from({ length: 81 }, (_, index) => {
        const strain = end * index / 80
        return { strain, stress: law.stress(strain) }
      }))
      const stressMax = Math.max(1, ...samples.flat().map((point) => Math.abs(point.stress)))
      const x = (strain: number) => frame.left + strain / extent * (frame.right - frame.left)
      const y = (stress: number) => frame.bottom - stress / stressMax * (frame.bottom - frame.peak)
      const path = (points: typeof samples[number]) =>
        points.map((point, index) => `${index ? 'L' : 'M'} ${x(point.strain).toFixed(2)} ${y(point.stress).toFixed(2)}`).join(' ')
      const peak = (points: typeof samples[number]) => points.reduce((best, point) => point.stress > best.stress ? point : best)
      const [design, reference] = samples
      const distinct = design.length !== reference.length || design.some((point, index) =>
        Math.abs(point.stress - reference[index].stress) > 1e-9 * stressMax || Math.abs(point.strain - reference[index].strain) > 1e-12)
      const designPeak = peak(design)
      const referencePeak = peak(reference)
      const peakStrain = laws[0].peakStrain
      return {
        design: path(design), reference: distinct ? path(reference) : '',
        xTicks: spacedTicks([
          ...(peakStrain !== undefined && peakStrain < laws[0].end ? [{ at: x(peakStrain), label: strainText(peakStrain) }] : []),
          { at: x(laws[0].end), label: strainText(laws[0].end) },
          ...(distinct && laws[1].end !== laws[0].end ? [{ at: x(laws[1].end), label: strainText(laws[1].end) }] : [])
        ]),
        yTicks: spacedTicks([
          { at: y(designPeak.stress), label: qfmt('stress', designPeak.stress, 1) },
          ...(distinct ? [{ at: y(referencePeak.stress), label: qfmt('stress', referencePeak.stress, 1) }] : [])
        ], 10),
        designPeak: { x: x(designPeak.strain), y: y(designPeak.stress) },
        designEnd: { x: x(laws[0].end), y: y(design[design.length - 1].stress) },
        distinct, error: ''
      }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Complete the concrete definition.' }
    }
  }, [store, basis, qfmt])

  return <div className="pm-material-curve">
    <MaterialCurveFrame label="Stress strain curve"
      stressLabel={<><MaterialSymbol symbol="sigmaC" svg /> ({unit('stress')})</>}
      strainLabel={<MaterialSymbol symbol="epsC" svg />}
      xTicks={preview.xTicks} yTicks={preview.yTicks}>
      {preview.reference && <path d={preview.reference} strokeDasharray="4 4" className="pm-material-curve-reference" />}
      {preview.design && <path d={preview.design} />}
      {preview.designPeak && <circle cx={preview.designPeak.x} cy={preview.designPeak.y} r="2" fill="currentColor" />}
      {preview.designEnd && <circle cx={preview.designEnd.x} cy={preview.designEnd.y} r="2" fill="currentColor" />}
    </MaterialCurveFrame>
    {preview.error ? <p role="status">{preview.error}</p> : <>
      <p>{caption}</p>
      <p>{preview.distinct ? 'Design law solid; characteristic reference dashed.' : 'Design and reference laws coincide; the resistance factor acts on resultants.'}</p>
    </>}
  </div>
}

type BlockLaws = Awaited<ReturnType<typeof import('@pm/analysis-equivalent-block')['resolveEquivalentBlockLaws']>>

/**
 * Equivalent-block σ–ε view: with a linear strain profile, the block of depth β1·c covers the fibres
 * whose strain lies in [(1 − β1)·εcu, εcu]. The stress level, β1 and εcu come from the same code
 * adapter as the analysis (`resolveEquivalentBlockLaws`), loaded on demand outside the initial bundle.
 */
export function BlockStressDiagram({ profileId, store, basis }: {
  profileId: CalculationProfileId
  store: MaterialStore
  basis: DesignBasis
}) {
  const { qfmt, unit } = useQuantityFormatters()
  const [laws, setLaws] = useState<{ value: BlockLaws | null; error: string }>({ value: null, error: '' })
  useEffect(() => {
    let current = true
    import('@pm/analysis-equivalent-block').then(({ resolveEquivalentBlockLaws }) => {
      if (!current) return
      try {
        setLaws({ value: resolveEquivalentBlockLaws(profileId, store, basis), error: '' })
      } catch (error) {
        setLaws({ value: null, error: error instanceof Error ? error.message : 'The block law is unavailable.' })
      }
    }, () => { if (current) setLaws({ value: null, error: 'The block law could not be loaded.' }) })
    return () => { current = false }
  }, [profileId, store, basis])

  const view = useMemo(() => {
    if (!laws.value) return null
    const { design, reference } = laws.value
    const extent = Math.max(design.extremeCompressionStrain, reference.extremeCompressionStrain)
    const stressMax = Math.max(1, design.compressionStress, reference.compressionStress)
    const x = (strain: number) => frame.left + strain / extent * (frame.right - frame.left)
    const y = (stress: number) => frame.bottom - stress / stressMax * (frame.bottom - frame.peak)
    const block = (law: typeof design) => {
      const start = (1 - law.depthFactor) * law.extremeCompressionStrain
      return { path: `M ${x(0)} ${y(0)} L ${x(start)} ${y(0)} L ${x(start)} ${y(law.compressionStress)} L ${x(law.extremeCompressionStrain)} ${y(law.compressionStress)} L ${x(law.extremeCompressionStrain)} ${y(0)}`, start }
    }
    const designBlock = block(design)
    const distinct = design.compressionStress !== reference.compressionStress || design.depthFactor !== reference.depthFactor ||
      design.extremeCompressionStrain !== reference.extremeCompressionStrain
    return {
      design: designBlock.path, reference: distinct ? block(reference).path : '', distinct, law: design,
      xTicks: spacedTicks([
        { at: x(designBlock.start), label: strainText(designBlock.start) },
        { at: x(design.extremeCompressionStrain), label: strainText(design.extremeCompressionStrain) }
      ]),
      yTicks: spacedTicks([
        { at: y(design.compressionStress), label: qfmt('stress', design.compressionStress, 1) },
        ...(distinct ? [{ at: y(reference.compressionStress), label: qfmt('stress', reference.compressionStress, 1) }] : [])
      ], 10)
    }
  }, [laws.value, qfmt])

  return <div className="pm-material-curve">
    <MaterialCurveFrame label="Equivalent block stress strain view"
      stressLabel={<><MaterialSymbol symbol="sigmaC" svg /> ({unit('stress')})</>}
      strainLabel={<MaterialSymbol symbol="epsC" svg />}
      xTicks={view?.xTicks} yTicks={view?.yTicks}>
      {view?.reference && <path d={view.reference} strokeDasharray="4 4" className="pm-material-curve-reference" />}
      {view?.design && <path d={view.design} />}
    </MaterialCurveFrame>
    {laws.error ? <p role="status">{laws.error}</p> : view ? <>
      <p>β<sub>1</sub> = {view.law.depthFactor.toFixed(4)} · ε<sub>cu</sub> = {view.law.extremeCompressionStrain} · σ<sub>block</sub> = {qfmt('stress', view.law.compressionStress, 3)} {unit('stress')}</p>
      <p>{view.distinct ? 'Design block solid; reference block dashed. ' : ''}Block over strains (1 − β<sub>1</sub>)·ε<sub>cu</sub> … ε<sub>cu</sub> of a linear profile.</p>
    </> : <p role="status">Resolving the block law…</p>}
  </div>
}
