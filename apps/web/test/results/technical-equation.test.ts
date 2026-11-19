import assert from 'node:assert/strict'
import test from 'node:test'
import katex from 'katex'

// Contract fixtures for the KaTeX API used by TechnicalEquation; Next.js owns JSX rendering.
const rendererOptions = {
  displayMode: true,
  output: 'htmlAndMathml' as const,
  strict: 'error' as const,
  throwOnError: true,
  trust: false
}

test('KaTeX retains HTML and MathML for authored calculation-trace notation', () => {
  const equations = [
    String.raw`\theta_{\mathrm{load}}=\operatorname{atan2}(M_{uy},M_{ux})=15.2^{\circ}`,
    String.raw`\mathbf{R}(\lambda)=\lambda\mathbf{D}_{\mathrm{check}}=(\lambda P_u,\lambda M_{ux},\lambda M_{uy})`,
    String.raw`UR_{\mathrm{fixed}\text{-}P}=\frac{M_{\mathrm{check}}}{M_b}=\frac{20}{40}=0.5`
  ]
  for (const latex of equations) {
    const markup = katex.renderToString(latex, rendererOptions)
    assert.match(markup, /class="katex-html"/u)
    assert.match(markup, /<math\b/u)
  }
})

test('KaTeX blocks trusted links and images and rejects invalid TeX under the adapter policy', () => {
  for (const latex of [
    String.raw`\href{javascript:alert(1)}{unsafe}`,
    String.raw`\includegraphics{https://invalid.example/asset.svg}`
  ]) {
    const markup = katex.renderToString(latex, rendererOptions)
    assert.doesNotMatch(markup, /<(?:a|img)\b/iu)
  }
  assert.throws(() => katex.renderToString(String.raw`\frac{`, rendererOptions), /KaTeX parse error/u)
})

test('GHSA-238p-pmpm-9mq7: inherited trust does not enable trusted KaTeX output', () => {
  // Reproduce the advisory without mutating Object.prototype or other tests.
  const options = { output: 'html' as const, throwOnError: true }
  Object.setPrototypeOf(options, { trust: true })
  const markup = katex.renderToString(String.raw`\href{javascript:alert(1)}{unsafe}`, options)
  assert.doesNotMatch(markup, /<a\b/iu)
})
