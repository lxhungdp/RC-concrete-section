const SYMBOLS = {
  fck: ['f', 'ck'],
  fcPrime: ['f′', 'c'],
  fcd: ['f', 'cd'],
  mc: ['m', 'c'],
  Ec: ['E', 'c'],
  epsC0: ['ε', 'c0'],
  epsC: ['ε', 'c'],
  epsC2: ['ε', 'c2'],
  epsCu: ['ε', 'cu'],
  sigmaC: ['σ', 'c'],
  sigmaBlock: ['σ', 'block'],
  beta1: ['β', '1'],
  alpha: ['α', ''],
  alpha2: ['α', '2'],
  gamma: ['γ', ''],
  eta: ['η', ''],
  alphaCc: ['α', 'cc'],
  gammaC: ['γ', 'c'],
  phiC: ['φ', 'c'],
  Pmax: ['P', 'max'],
  fy: ['f', 'y'],
  fuk: ['f', 'uk'],
  fyd: ['f', 'yd'],
  fyEff: ['f', 'y,eff'],
  Es: ['E', 's'],
  Eh: ['E', 'h'],
  epsU: ['ε', 'u'],
  epsUk: ['ε', 'uk'],
  epsUd: ['ε', 'ud'],
  epsY: ['ε', 'y'],
  epsS: ['ε', 's'],
  epsPhysical: ['ε', 'phys'],
  sigmaS: ['σ', 's'],
  alphaEps: ['α', 'ε'],
  gammaS: ['γ', 's'],
  phiS: ['φ', 's']
} as const

/** Typesetting only; stored field names and the engineering meaning of each symbol are unchanged. */
export function MaterialSymbol({ symbol, svg = false }: { symbol: keyof typeof SYMBOLS; svg?: boolean }) {
  const [base, subscript] = SYMBOLS[symbol]
  return svg ? <>
    <tspan fontStyle="italic">{base}</tspan>{subscript && <tspan baselineShift="sub" fontSize="75%">{subscript}</tspan>}
  </> : <><var>{base}</var>{subscript && <sub>{subscript}</sub>}</>
}

/** Format known factor notation without interpreting or replacing an unknown factor. */
export function MaterialFactorSymbol({ symbol }: { symbol: string }) {
  switch (symbol) {
    case 'αcc': return <MaterialSymbol symbol="alphaCc" />
    case 'γC': return <MaterialSymbol symbol="gammaC" />
    case 'φc': return <MaterialSymbol symbol="phiC" />
    case 'γS': return <MaterialSymbol symbol="gammaS" />
    case 'φs': return <MaterialSymbol symbol="phiS" />
    default: return <>{symbol}</>
  }
}
