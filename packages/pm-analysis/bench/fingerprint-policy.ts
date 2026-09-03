export const CAPACITY_FINGERPRINT_POLICY = 'capacity-fingerprint-v2' as const

/**
 * Cross-platform JavaScript transcendental implementations may move the last few result bits.
 * This allowance is applied only after normalizing by the complete section force or moment scale;
 * it is not an engineering, convergence, utilization, or acceptance tolerance.
 */
export const PORTABLE_RESULTANT_ROUNDOFF_MULTIPLIER = 8
export const PORTABLE_RESULTANT_NORMALIZED_LIMIT =
  PORTABLE_RESULTANT_ROUNDOFF_MULTIPLIER * Number.EPSILON

export type FingerprintComparisonMode = 'exact' | 'portable'
export type FingerprintValue = number[] | string
export type CapacityFingerprint = Record<string, FingerprintValue>

export type CapacityFingerprintCase = {
  key: string
  fingerprint: CapacityFingerprint
}

export type CapacityFingerprintRuntime = {
  node: string
  npm: string
  v8: string
  platform: NodeJS.Platform
  arch: string
}

export type CapacityFingerprintBaseline = CapacityFingerprintRuntime & {
  note: string
  policy: typeof CAPACITY_FINGERPRINT_POLICY
  cases: CapacityFingerprintCase[]
}

export type FingerprintDeviation = {
  caseKey: string
  quantity: string
  absolute: number
  valueRelative: number
  sectionNormalized: number
  allowed: boolean
  detail: string
}

const FORCE_RESULTANTS = new Set([
  'surfaceP',
  'surfaceConcreteP',
  'surfaceSteelP',
  'surfaceDisplacedP',
  'momentPlaneP'
])

const MOMENT_RESULTANTS = new Set([
  'surfaceMx',
  'surfaceMy',
  'contourMx',
  'contourMy',
  'momentPlaneM'
])

const finiteMagnitude = (value: number) => Number.isFinite(value) ? Math.abs(value) : 0

const resultantScale = (
  expected: CapacityFingerprint,
  observed: CapacityFingerprint,
  quantities: ReadonlySet<string>
) => {
  let scale = 1
  for (const quantity of quantities) {
    for (const fingerprint of [expected, observed]) {
      const values = fingerprint[quantity]
      if (!Array.isArray(values)) continue
      for (const value of values) scale = Math.max(scale, finiteMagnitude(value))
    }
  }
  return scale
}

const relativeDeviation = (observed: number, expected: number) => {
  if (Object.is(observed, expected)) return 0
  if (Number.isNaN(observed) && Number.isNaN(expected)) return 0
  const scale = Math.max(Math.abs(expected), Math.abs(observed))
  if (scale === 0) return 0
  return Math.abs(observed - expected) / scale
}

const structuralDeviation = (
  caseKey: string,
  quantity: string,
  detail: string
): FingerprintDeviation => ({
  caseKey,
  quantity,
  absolute: Number.POSITIVE_INFINITY,
  valueRelative: Number.POSITIVE_INFINITY,
  sectionNormalized: Number.POSITIVE_INFINITY,
  allowed: false,
  detail
})

const portableScaleFor = (
  quantity: string,
  forceScale: number,
  momentScale: number
) => FORCE_RESULTANTS.has(quantity) ? forceScale : MOMENT_RESULTANTS.has(quantity) ? momentScale : null

export const currentCapacityFingerprintRuntime = (npm: string): CapacityFingerprintRuntime => ({
  node: process.version,
  npm,
  v8: process.versions.v8,
  platform: process.platform,
  arch: process.arch
})

export const capacityFingerprintProvenanceError = (
  baseline: Partial<CapacityFingerprintBaseline>,
  runtime: CapacityFingerprintRuntime,
  mode: FingerprintComparisonMode
) => {
  if (baseline.policy !== CAPACITY_FINGERPRINT_POLICY) {
    return `expected policy ${CAPACITY_FINGERPRINT_POLICY}; received ${baseline.policy ?? 'unknown'}`
  }

  const commonFields = ['node', 'npm', 'v8'] as const
  for (const field of commonFields) {
    if (baseline[field] !== runtime[field]) {
      return `expected ${field} ${runtime[field]}; received ${baseline[field] ?? 'unknown'}`
    }
  }

  if (!baseline.platform || !baseline.arch) {
    return `baseline platform provenance is incomplete: ${baseline.platform ?? 'unknown'}/${baseline.arch ?? 'unknown'}`
  }

  if (mode === 'exact' && (baseline.platform !== runtime.platform || baseline.arch !== runtime.arch)) {
    return `exact comparison requires ${runtime.platform}/${runtime.arch}; baseline is ${baseline.platform}/${baseline.arch}`
  }

  return null
}

export const compareCapacityFingerprints = (
  baselineCases: readonly CapacityFingerprintCase[],
  observedCases: readonly CapacityFingerprintCase[],
  mode: FingerprintComparisonMode,
  ignoredQuantities: ReadonlySet<string> = new Set()
) => {
  const deviations: FingerprintDeviation[] = []
  const baselineByKey = new Map(baselineCases.map((item) => [item.key, item]))
  const observedByKey = new Map(observedCases.map((item) => [item.key, item]))
  const caseKeys = new Set([...baselineByKey.keys(), ...observedByKey.keys()])

  for (const caseKey of caseKeys) {
    const baselineCase = baselineByKey.get(caseKey)
    const observedCase = observedByKey.get(caseKey)
    if (!baselineCase) {
      deviations.push(structuralDeviation(caseKey, '(case)', 'new case is absent from the baseline'))
      continue
    }
    if (!observedCase) {
      deviations.push(structuralDeviation(caseKey, '(case)', 'baseline case is absent from the observed run'))
      continue
    }

    const expected = baselineCase.fingerprint
    const observed = observedCase.fingerprint
    const forceScale = resultantScale(expected, observed, FORCE_RESULTANTS)
    const momentScale = resultantScale(expected, observed, MOMENT_RESULTANTS)
    const quantities = new Set([...Object.keys(expected), ...Object.keys(observed)])

    for (const quantity of quantities) {
      if (ignoredQuantities.has(quantity)) continue
      const expectedValue = expected[quantity]
      const observedValue = observed[quantity]

      if (expectedValue === undefined) {
        deviations.push(structuralDeviation(caseKey, quantity, 'new quantity is absent from the baseline'))
        continue
      }
      if (observedValue === undefined) {
        deviations.push(structuralDeviation(caseKey, quantity, 'baseline quantity is absent from the observed run'))
        continue
      }
      if (typeof expectedValue === 'string' || typeof observedValue === 'string') {
        if (expectedValue !== observedValue) {
          deviations.push(
            structuralDeviation(caseKey, quantity, `"${String(expectedValue)}" -> "${String(observedValue)}"`)
          )
        }
        continue
      }
      if (expectedValue.length !== observedValue.length) {
        deviations.push(
          structuralDeviation(caseKey, quantity, `length ${expectedValue.length} -> ${observedValue.length}`)
        )
        continue
      }

      const portableScale = mode === 'portable'
        ? portableScaleFor(quantity, forceScale, momentScale)
        : null
      for (let index = 0; index < observedValue.length; index++) {
        const expectedNumber = expectedValue[index]
        const observedNumber = observedValue[index]
        if (Object.is(expectedNumber, observedNumber)) continue
        if (Number.isNaN(expectedNumber) && Number.isNaN(observedNumber)) continue

        if (!Number.isFinite(expectedNumber) || !Number.isFinite(observedNumber)) {
          deviations.push(
            structuralDeviation(caseKey, quantity, `[${index}] ${expectedNumber} -> ${observedNumber}`)
          )
          continue
        }

        const absolute = Math.abs(observedNumber - expectedNumber)
        const sectionNormalized = portableScale === null ? relativeDeviation(observedNumber, expectedNumber) : absolute / portableScale
        deviations.push({
          caseKey,
          quantity,
          absolute,
          valueRelative: relativeDeviation(observedNumber, expectedNumber),
          sectionNormalized,
          allowed: portableScale !== null && sectionNormalized <= PORTABLE_RESULTANT_NORMALIZED_LIMIT,
          detail: `[${index}] ${expectedNumber} -> ${observedNumber}`
        })
      }
    }
  }

  return deviations.sort((left, right) => {
    if (left.allowed !== right.allowed) return left.allowed ? 1 : -1
    return right.sectionNormalized - left.sectionNormalized
  })
}
