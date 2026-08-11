'use client'

type Props = {
  error: Error & { digest?: string }
  reset: () => void
}

/** Last-resort UI isolation; calculation failures continue to use their typed in-workspace errors. */
export default function ApplicationError({ error, reset }: Props) {
  return (
    <main className="pm-application-error" role="alert">
      <section>
        <p className="pm-application-error-kicker">Application recovery</p>
        <h1>The workspace could not continue safely.</h1>
        <p>
          No result has been accepted or released. Retry the current view; if the problem repeats,
          reload the saved project and record the reference below.
        </p>
        {error.digest ? <code>Reference: {error.digest}</code> : null}
        <div className="pm-application-error-actions">
          <button type="button" onClick={reset}>Retry</button>
          <button type="button" onClick={() => window.location.reload()}>Reload application</button>
        </div>
      </section>
    </main>
  )
}
