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

let plotlyModule: Promise<PlotlyApi> | null = null

/**
 * One shared import promise for every chart on the page.
 *
 * `plotly.js-dist-min` is the heaviest dependency in the bundle. Importing it per chart made the
 * first render of a three-plot stage wait on three separate module resolutions; sharing the promise
 * means the second and third charts attach to the same download.
 */
const loadPlotly = (): Promise<PlotlyApi> => {
  if (!plotlyModule) {
    plotlyModule = import('plotly.js-dist-min').then(
      (module) => (module.default ?? module) as unknown as PlotlyApi
    )
  }
  return plotlyModule
}

/**
 * Warm the Plotly chunk before a chart is mounted.
 *
 * Called when the user is about to open a results menu, so the download overlaps with the surface
 * build instead of starting after it.
 */
export const preloadPlotly = () => {
  void loadPlotly().catch(() => {
    // A failed preload is not an error: the real mount will retry and surface it.
    plotlyModule = null
  })
}

export function PlotlyChart({ data, layout, config, onClick }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const plotlyRef = useRef<null | PlotlyApi>(null)
  const clickRef = useRef(onClick)
  const attachedClickRef = useRef(false)
  const mountedRef = useRef(false)
  const renderRevisionRef = useRef(0)
  const renderQueueRef = useRef<Promise<void>>(Promise.resolve())
  const latestRenderRef = useRef({ data, layout, config })
  clickRef.current = onClick
  latestRenderRef.current = { data, layout, config }

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      renderRevisionRef.current += 1
      const host = hostRef.current
      void renderQueueRef.current.finally(() => {
        const Plotly = plotlyRef.current
        if (host && Plotly) Plotly.purge(host)
      })
    }
  }, [])

  useEffect(() => {
    const revision = ++renderRevisionRef.current
    const render = async () => {
      try {
        const Plotly = plotlyRef.current ?? (await loadPlotly())
        if (!mountedRef.current || revision !== renderRevisionRef.current) return
        const host = hostRef.current
        if (!host) return
        plotlyRef.current = Plotly
        const next = latestRenderRef.current

        await Plotly.react(
          host,
          next.data,
          {
            ...next.layout,
            autosize: true,
            uirevision: next.layout.uirevision ?? 'pm-chart',
            // Let Plotly measure the host; do not pin width/height in layout.
            width: undefined,
            height: undefined
          },
          {
            responsive: true,
            displaylogo: false,
            scrollZoom: true,
            ...next.config
          }
        )
        if (!mountedRef.current || revision !== renderRevisionRef.current) return
        if (host.clientWidth > 8 && host.clientHeight > 8) Plotly.Plots.resize(host)

        if (!attachedClickRef.current) {
          // The handler reads through a ref, so a new `onClick` identity never re-attaches it — and,
          // more importantly, never re-runs this effect and redraws the whole plot.
          const clickHandler = (event: PlotlyClickPayload) => clickRef.current?.(event)
          ;(host as unknown as { on: (event: string, handler: typeof clickHandler) => void }).on(
            'plotly_click',
            clickHandler
          )
          attachedClickRef.current = true
        }
      } catch {
        if (!plotlyRef.current) plotlyModule = null
      }
    }

    // A loadcase change updates demand, inverse result, exact curve, and field map in sequence.
    // Serialize Plotly work and let queued stale revisions exit before touching the host, instead
    // of allowing several Plotly.react calls to clear/redraw the same element concurrently.
    renderQueueRef.current = renderQueueRef.current.then(render, render)
  }, [config, data, layout])

  /**
   * Resizing is independent of the data: observing the host once, rather than inside the render
   * effect, keeps a container resize from being confused with a data change.
   */
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const observer = new ResizeObserver(() => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        const node = hostRef.current
        const api = plotlyRef.current
        if (!node || !api || node.clientWidth < 8 || node.clientHeight < 8) return
        api.Plots.resize(node)
      }, 40)
    })
    observer.observe(host)
    return () => {
      if (timer) clearTimeout(timer)
      observer.disconnect()
    }
  }, [])

  return <div ref={hostRef} className="pm-plotly-host" />
}
