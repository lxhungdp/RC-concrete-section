export const EN1992_2004_PROVENANCE = {
  document: 'EN 1992-1-1:2004',
  concrete: 'Clauses 3.1.6 and 3.1.7; Table 3.1',
  steel: 'Clauses 3.2.7 and 3.2.8',
  resistance: 'Recommended material partial factors; no National Annex selected',
  methodId: 'en-1992-1-1-2004-parabolic-rectangular-design-materials',
  implementationVersion: '1.0.0-preview',
  verificationStatus: 'draft-unverified'
} as const

/** Recommended values; Nationally Determined Parameters may replace them. */
export const EN1992_ALPHA_CC = 1
export const EN1992_GAMMA_C = 1.5
export const EN1992_GAMMA_S = 1.15
export const EN1992_STEEL_ES = 200000

const assertConcreteStrength = (fck: number) => {
  if (!Number.isFinite(fck) || fck <= 0 || fck > 90) {
    throw new RangeError('EN 1992 preview supports finite concrete strength 0 < fck <= 90 MPa.')
  }
}

export type En1992ParabolicRectangularParameters = {
  n: number
  epsC2: number
  epsCu2: number
}

/** EN 1992-1-1:2004 Table 3.1, strains returned as ratios rather than per mille. */
export const en1992ParabolicRectangularParameters = (
  fck: number
): En1992ParabolicRectangularParameters => {
  assertConcreteStrength(fck)
  if (fck <= 50) return { n: 2, epsC2: 0.002, epsCu2: 0.0035 }
  const strengthRatio = (90 - fck) / 100
  return {
    n: 1.4 + 23.4 * strengthRatio ** 4,
    epsC2: (2 + 0.085 * (fck - 50) ** 0.53) / 1000,
    epsCu2: (2.6 + 35 * strengthRatio ** 4) / 1000
  }
}

export const en1992MeanCompressiveStrength = (fck: number) => {
  assertConcreteStrength(fck)
  return fck + 8
}

export const en1992ConcreteElasticModulus = (fck: number) =>
  22000 * Math.pow(en1992MeanCompressiveStrength(fck) / 10, 0.3)

export const en1992ConcreteDesignStrength = (
  fck: number,
  alphaCc = EN1992_ALPHA_CC,
  gammaC = EN1992_GAMMA_C
) => {
  assertConcreteStrength(fck)
  if (!Number.isFinite(alphaCc) || alphaCc <= 0 || !Number.isFinite(gammaC) || gammaC <= 0) {
    throw new RangeError('EN 1992 alpha_cc and gamma_C must be finite and positive.')
  }
  return alphaCc * fck / gammaC
}

export const en1992SteelDesignStrength = (
  fyk: number,
  gammaS = EN1992_GAMMA_S
) => {
  if (!Number.isFinite(fyk) || fyk <= 0 || !Number.isFinite(gammaS) || gammaS <= 0) {
    throw new RangeError('EN 1992 fyk and gamma_S must be finite and positive.')
  }
  return fyk / gammaS
}
