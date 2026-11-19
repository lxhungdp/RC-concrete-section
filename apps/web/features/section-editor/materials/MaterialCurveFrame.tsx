import type { ReactNode } from 'react'

/**
 * Shared display frame of the material σ–ε charts; these are SVG coordinates. The left and bottom
 * margins hold tick values (2026-11-09 review item 1).
 */
export const MATERIAL_CURVE_FRAME = {
  width: 320, height: 184,
  left: 46, right: 308, top: 16, bottom: 150,
  middle: 83, peak: 26, signedStressSpan: 60
} as const

/** A tick at an SVG coordinate with its formatted value. */
export type MaterialCurveTick = { at: number; label: string }

export function MaterialCurveFrame({ label, originX = MATERIAL_CURVE_FRAME.left,
  originY = MATERIAL_CURVE_FRAME.bottom, stressLabel = 'σ', strainLabel = 'ε', xTicks = [], yTicks = [], children }: {
  label: string
  originX?: number
  originY?: number
  stressLabel?: ReactNode
  strainLabel?: ReactNode
  xTicks?: readonly MaterialCurveTick[]
  yTicks?: readonly MaterialCurveTick[]
  children: ReactNode
}) {
  const frame = MATERIAL_CURVE_FRAME
  return <svg viewBox={`0 0 ${frame.width} ${frame.height}`} aria-label={label}>
    <line x1={frame.left} y1={originY} x2={frame.right} y2={originY} aria-label="Strain axis" />
    <line x1={originX} y1={frame.bottom} x2={originX} y2={frame.top} aria-label="Stress axis" />
    {originY !== frame.middle && <line x1={frame.left} y1={frame.middle} x2={frame.right} y2={frame.middle}
      className="pm-material-curve-axis-mid" />}
    <g className="pm-material-curve-ticks" aria-label="Axis values">
      {xTicks.map((tick) => <g key={`x-${tick.at}-${tick.label}`}>
        <line x1={tick.at} y1={frame.bottom} x2={tick.at} y2={frame.bottom + 3} />
        <text x={tick.at} y={frame.bottom + 13} textAnchor={tick.at > frame.right - 18 ? 'end' : 'middle'}>{tick.label}</text>
      </g>)}
      {yTicks.map((tick) => <g key={`y-${tick.at}-${tick.label}`}>
        <line x1={frame.left - 3} y1={tick.at} x2={frame.left} y2={tick.at} />
        <text x={frame.left - 5} y={tick.at + 3} textAnchor="end">{tick.label}</text>
      </g>)}
    </g>
    <text x={frame.left + 2} y={frame.top - 4}>{stressLabel}</text>
    <text x={frame.right} y={frame.bottom + 24} textAnchor="end">{strainLabel}</text>
    {children}
  </svg>
}

/** Ticks that stay legible: drops a tick closer than `gap` SVG units to an earlier one. */
export const spacedTicks = (ticks: readonly MaterialCurveTick[], gap = 26): MaterialCurveTick[] =>
  ticks.filter((tick) => Number.isFinite(tick.at)).reduce<MaterialCurveTick[]>((kept, tick) =>
    kept.some((other) => Math.abs(other.at - tick.at) < gap) ? kept : [...kept, tick], [])
