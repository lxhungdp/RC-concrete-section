import type { ReactNode } from 'react'

/** Concrete's existing display frame, shared by both material charts; these are SVG coordinates. */
export const MATERIAL_CURVE_FRAME = {
  width: 250, height: 110,
  left: 12, right: 238, top: 14, bottom: 96,
  middle: 55, peak: 20, signedStressSpan: 38
} as const

export function MaterialCurveFrame({ label, originX = MATERIAL_CURVE_FRAME.left,
  originY = MATERIAL_CURVE_FRAME.bottom, stressLabel = 'σ', strainLabel = 'ε', children }: {
  label: string
  originX?: number
  originY?: number
  stressLabel?: ReactNode
  strainLabel?: ReactNode
  children: ReactNode
}) {
  const frame = MATERIAL_CURVE_FRAME
  return <svg viewBox={`0 0 ${frame.width} ${frame.height}`} aria-label={label}>
    <line x1={frame.left} y1={originY} x2={frame.right} y2={originY} aria-label="Strain axis" />
    <line x1={originX} y1={frame.bottom} x2={originX} y2={frame.top} aria-label="Stress axis" />
    {originY !== frame.middle && <line x1={frame.left} y1={frame.middle} x2={frame.right} y2={frame.middle}
      className="pm-material-curve-axis-mid" />}
    <text x={frame.left + 2} y={frame.top}>{stressLabel}</text>
    <text x={frame.right - 12} y={frame.bottom + 10}>{strainLabel}</text>
    {children}
  </svg>
}
