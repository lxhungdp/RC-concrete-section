'use client'

import { useEffect, useRef } from 'react'

export type PlotlyClickPayload = {
  points?: Array<{
    curveNumber: number
    pointNumber?: number
    pointIndex?: number | number[]
    x?: number
    y?: number
    z?: number
    customdata?: unknown
  }>
}

type Props = {
  data: unknown[]
  layout: Record<string, unknown>
  config?: Record<string, unknown>
  onClick?: (event: PlotlyClickPayload) => void
}

type PlotlyApi = {
  react: (host: HTMLElement, data: unknown[], layout: Record<string, unknown>, config?: Record<string, unknown>) => Promise<void>
  purge: (host: HTMLElement) => void
}

export function PlotlyChart({ data, layout, config, onClick }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const plotlyRef = useRef<null | PlotlyApi>(null)
  const clickRef = useRef(onClick)
  const attachedClickRef = useRef(false)
  clickRef.current = onClick

  useEffect(() => {
    let disposed = false

    const render = async () => {
      const host = hostRef.current
      if (!host) return
      const module = plotlyRef.current ? null : await import('plotly.js-dist-min')
      if (disposed) return
      const Plotly = plotlyRef.current ?? module?.default
      if (!Plotly) return
      plotlyRef.current = Plotly
      await Plotly.react(host, data, layout, {
        responsive: true,
        displaylogo: false,
        scrollZoom: true,
        ...config
      })

      if (!attachedClickRef.current) {
        const clickHandler = (event: PlotlyClickPayload) => clickRef.current?.(event)
        ;(host as unknown as { on: (event: string, handler: typeof clickHandler) => void }).on('plotly_click', clickHandler)
        attachedClickRef.current = true
      }
    }

    render()

    return () => {
      disposed = true
    }
  }, [config, data, layout, onClick])

  useEffect(
    () => () => {
      const host = hostRef.current
      if (host && plotlyRef.current) plotlyRef.current.purge(host)
    },
    []
  )

  return <div ref={hostRef} className="pm-plotly-host" />
}
