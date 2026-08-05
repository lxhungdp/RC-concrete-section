'use client'

import { Loader2 } from 'lucide-react'

/**
 * Placeholder shown while a heavy stage chunk downloads, or while its surface is still being built.
 *
 * The results stage pulls in Plotly and the analysis kernels, so opening it is not instant on a
 * cold cache. Before this existed the app simply stayed on the previous screen for a second or
 * more with nothing to explain the delay, which reads as a freeze rather than as work in progress.
 */
export function WorkspaceLoading({
  title,
  detail,
  charts = 3
}: {
  title: string
  detail?: string
  /** Number of skeleton plot frames, so the placeholder matches the layout that replaces it. */
  charts?: number
}) {
  return (
    <section className="pm-workspace-loading" aria-busy="true" aria-live="polite">
      <div className="pm-workspace-loading-head">
        <Loader2 size={16} className="pm-spin" />
        <div>
          <strong>{title}</strong>
          {detail ? <span>{detail}</span> : null}
        </div>
      </div>
      <div className="pm-workspace-loading-grid" aria-hidden="true">
        {Array.from({ length: charts }, (_, index) => (
          <div key={index} className="pm-workspace-loading-card" />
        ))}
      </div>
    </section>
  )
}
