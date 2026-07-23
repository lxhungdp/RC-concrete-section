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
  react: (
    host: HTMLElement,
    data: unknown[],
    layout: Record<string, unknown>,
    config?: Record<string, unknown>
  ) => Promise<void>
  purge: (host: HTMLElement) => void
  Plots: { resize: (host: HTMLElement) => void }
}

export function PlotlyChart({ data, layout, config, onClick }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const plotlyRef = useRef<null | PlotlyApi>(null)
  const clickRef = useRef(onClick)
  const attachedClickRef = useRef(false)
  clickRef.current = onClick

  useEffect(() => {
    let disposed = false
    let resizeObserver: ResizeObserver | null = null
    let resizeTimer: ReturnType<typeof setTimeout> | null = null

    const render = async () => {
      const host = hostRef.current
      if (!host) return
      const module = plotlyRef.current ? null : await import('plotly.js-dist-min')
      if (disposed) return
      const Plotly = plotlyRef.current ?? (module?.default as PlotlyApi | undefined)
      if (!Plotly) return
      plotlyRef.current = Plotly

      await Plotly.react(
        host,
        data,
        {
          ...layout,
          autosize: true,
          // Let Plotly measure the host; do not pin width/height in layout.
          width: undefined,
          height: undefined
        },
        {
          responsive: true,
          displaylogo: false,
          scrollZoom: true,
          ...config
        }
      )
      if (disposed) return
      if (host.clientWidth > 8 && host.clientHeight > 8) Plotly.Plots.resize(host)

      if (!attachedClickRef.current) {
        const clickHandler = (event: PlotlyClickPayload) => clickRef.current?.(event)
        ;(host as unknown as { on: (event: string, handler: typeof clickHandler) => void }).on(
          'plotly_click',
          clickHandler
        )
        attachedClickRef.current = true
      }

      resizeObserver = new ResizeObserver(() => {
        if (resizeTimer) clearTimeout(resizeTimer)
        resizeTimer = setTimeout(() => {
          const node = hostRef.current
          const api = plotlyRef.current
          if (!node || !api || node.clientWidth < 8 || node.clientHeight < 8) return
          api.Plots.resize(node)
        }, 40)
      })
      resizeObserver.observe(host)
    }

    render()

    return () => {
      disposed = true
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeObserver?.disconnect()
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
