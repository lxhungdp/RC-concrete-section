'use client'

import katex from 'katex'

type TechnicalEquationProps = {
  latex: string
  ariaLabel: string
}

/**
 * Presentation-only TeX renderer for calculation traces. The source expression is authored by the
 * application; user/project text is never interpolated as executable or trusted KaTeX markup.
 */
export function TechnicalEquation({ latex, ariaLabel }: TechnicalEquationProps) {
  let html: string
  try {
    html = katex.renderToString(latex, {
      displayMode: true,
      output: 'htmlAndMathml',
      strict: 'error',
      throwOnError: true,
      trust: false
    })
  } catch {
    return <span className="pm-technical-equation__error" role="alert">Formula rendering unavailable</span>
  }

  return (
    <span
      className="pm-technical-equation"
      aria-label={ariaLabel}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
