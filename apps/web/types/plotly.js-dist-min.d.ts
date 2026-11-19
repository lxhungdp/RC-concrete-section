declare module 'plotly.js-dist-min' {
  const Plotly: {
    react: (host: HTMLElement, data: unknown[], layout: Record<string, unknown>, config?: Record<string, unknown>) => Promise<void>
    purge: (host: HTMLElement) => void
  }

  export default Plotly
}
