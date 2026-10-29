export type SectionAxesFrame = {
  width: number
  height: number
  origin: { x: number; y: number }
  bounds: { left: number; right: number; top: number; bottom: number }
  worldOrigin: { x: number; y: number }
}

/** Display margins in CSS pixels, shared by the field and geometry-only views. */
export const SECTION_MOMENT_AXES_PADDING = { left: 48, right: 132, top: 78, bottom: 36 } as const

const MOMENT_LOOP_SCALE = 1.25

const loopPath = (cx: number, cy: number, rx: number, ry: number, start: number) =>
  Array.from({ length: 25 }, (_, index) => {
    const angle = start - index * Math.PI / 24
    const x = cx + MOMENT_LOOP_SCALE * rx * Math.cos(angle)
    const y = cy + MOMENT_LOOP_SCALE * ry * Math.sin(angle)
    return `${index ? 'L' : 'M'}${x},${y}`
  }).join(' ')

/** engineering/02 §2: applied input axes; the calculation origin remains the exact centroid. */
export function SectionMomentAxes({ frame }: { frame: SectionAxesFrame }) {
  const { width, height, origin, bounds, worldOrigin } = frame
  const xEnd = Math.max(bounds.right, origin.x) + 66
  const yEnd = Math.min(bounds.top, origin.y) - 66
  const mx = { x: Math.max(bounds.right, origin.x) + 40, y: origin.y }
  const my = { x: origin.x, y: Math.min(bounds.top, origin.y) - 40 }
  const s = MOMENT_LOOP_SCALE
  return (
    <svg className="pm-section-moment-axes" viewBox={`0 0 ${width} ${height}`}
      role="img" aria-label="Load reference X and Y axes with positive Mux and Muy rotation arrows"
      data-origin-x={worldOrigin.x} data-origin-y={worldOrigin.y}>
      <title>O is the applied load reference: centroid plus the applied X/Y offsets. Mux and Muy are entered about O. Positive Mux follows ΣF(y−yO), and positive Muy follows ΣF(x−xO); compression is positive.</title>
      <g className="pm-section-centroid-axes" fill="none" stroke="currentColor" strokeWidth="1">
        <path data-axis="X" d={`M${Math.min(bounds.left, origin.x) - 12},${origin.y}H${xEnd}`} strokeDasharray="5 4" />
        <path data-axis="Y" d={`M${origin.x},${Math.max(bounds.bottom, origin.y) + 12}V${yEnd}`} strokeDasharray="5 4" />
        <path d={`M${xEnd - 5},${origin.y - 3}L${xEnd},${origin.y}L${xEnd - 5},${origin.y + 3}`} />
        <path d={`M${origin.x - 3},${yEnd + 5}L${origin.x},${yEnd}L${origin.x + 3},${yEnd + 5}`} />
      </g>
      <g className="pm-section-axis-labels">
        <text x={xEnd + 5} y={origin.y + 4}>X</text>
        <text x={origin.x + 7} y={yEnd + 3}>Y</text>
        <circle data-axis-origin="true" cx={origin.x} cy={origin.y} r="3" />
        <text x={origin.x + 6} y={origin.y + 14}>O</text>
      </g>
      <g className="pm-section-moment-loop pm-section-moment-loop--x" role="img" aria-label="Positive Mux rotation about X">
        <title>+Mux = ΣF(y−yO), compression positive.</title>
        <path d={loopPath(mx.x, mx.y, 8, 18, -Math.PI / 2)} strokeDasharray="3 3" opacity="0.5" />
        <path d={loopPath(mx.x, mx.y, 8, 18, Math.PI / 2)} />
        <path className="pm-section-moment-arrow" d={`M${mx.x + 8 * s},${mx.y - 3 * s}l${-3 * s},${6 * s}h${6 * s}Z`} />
        <text x={mx.x + 12 * s} y={mx.y - 18 * s - 8}>+Mux</text>
      </g>
      <g className="pm-section-moment-loop pm-section-moment-loop--y" role="img" aria-label="Positive Muy rotation about Y">
        <title>+Muy = ΣF(x−xO), compression positive.</title>
        <path d={loopPath(my.x, my.y, 18, 6, 0)} strokeDasharray="3 3" opacity="0.5" />
        <path d={loopPath(my.x, my.y, 18, 6, Math.PI)} />
        <path className="pm-section-moment-arrow" d={`M${my.x + 3 * s},${my.y + 6 * s}l${-6 * s},${-3 * s}v${6 * s}Z`} />
        <text x={my.x + 25 * s} y={my.y + 4}>+Muy</text>
      </g>
    </svg>
  )
}
