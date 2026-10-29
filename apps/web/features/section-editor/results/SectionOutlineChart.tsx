import { useEffect, useRef, useState } from 'react'
import { netConcreteCentroid, type GeometryInputRebarView, type SectionGeometry } from '@pm/geometry'
import { CENTROID_LOAD_REFERENCE, resolveLoadOrigin, type LoadReference } from '@pm/project'
import { sectionFieldViewport } from './section-field-viewport'
import { SectionMomentAxes, SECTION_MOMENT_AXES_PADDING, type SectionAxesFrame } from './SectionMomentAxes'

/** Geometry and reference axes remain inspectable when no physical field exists. */
export function SectionOutlineChart({ section, rebars, loadReference = CENTROID_LOAD_REFERENCE }: {
  section: SectionGeometry
  rebars: GeometryInputRebarView[]
  loadReference?: LoadReference
}) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [frame, setFrame] = useState<SectionAxesFrame | null>(null)
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const points = section.solids.flatMap(solid => solid.outer)
    if (!points.length) return
    const minX = Math.min(...points.map(point => point.x))
    const maxX = Math.max(...points.map(point => point.x))
    const minY = Math.min(...points.map(point => point.y))
    const maxY = Math.max(...points.map(point => point.y))
    if (maxX <= minX || maxY <= minY) return
    const worldOrigin = resolveLoadOrigin(netConcreteCentroid(section), loadReference)
    const resize = () => {
      const width = Math.max(1, host.clientWidth)
      const height = Math.max(1, host.clientHeight)
      const { worldMinX, worldMaxY, scale, offsetX, offsetY } = sectionFieldViewport(
        width, height, { minX, maxX, minY, maxY }, worldOrigin, SECTION_MOMENT_AXES_PADDING
      )
      const x = (value: number) => offsetX + (value - worldMinX) * scale
      const y = (value: number) => offsetY + (worldMaxY - value) * scale
      setFrame({ width, height, worldOrigin,
        origin: { x: x(worldOrigin.x), y: y(worldOrigin.y) },
        bounds: { left: x(minX), right: x(maxX), top: y(maxY), bottom: y(minY) } })
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    return () => observer.disconnect()
  }, [section, loadReference])
  const points = section.solids.flatMap(solid => solid.outer)
  const minX = Math.min(...points.map(point => point.x))
  const maxX = Math.max(...points.map(point => point.x))
  const maxY = Math.max(...points.map(point => point.y))
  const scale = frame && maxX > minX ? (frame.bounds.right - frame.bounds.left) / (maxX - minX) : 1
  const ringPath = (ring: readonly { x: number; y: number }[], current: SectionAxesFrame) =>
    ring.map((point, index) => `${index ? 'L' : 'M'} ${current.bounds.left + (point.x - minX) * scale} ${current.bounds.top + (maxY - point.y) * scale}`).join(' ') + ' Z'
  return <div ref={hostRef} className="pm-section-field-host">
    {frame && <>
    <svg className="pm-section-field-canvas" role="img" aria-label="Section geometry; section field unavailable"
      viewBox={`0 0 ${frame.width} ${frame.height}`}>
      {section.solids.map((solid, index) => <path key={index}
        d={[solid.outer, ...solid.holes].map(ring => ringPath(ring, frame)).join(' ')} fill="none"
        stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />)}
      {rebars.map(bar => <circle key={bar.id}
        cx={frame.bounds.left + (bar.x - minX) * scale} cy={frame.bounds.top + (maxY - bar.y) * scale} r={bar.dia / 2 * scale}
        fill="currentColor" />)}
    </svg>
    <SectionMomentAxes frame={frame} />
    </>}
  </div>
}
