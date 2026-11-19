import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

import type { AdsecManifestEntry } from './manifest'

const NUM = String.raw`[-+]?(?:\d+\.?\d*|\.\d+)(?:[Ee][-+]?\d+)?`
const NUMBER_TOKEN = new RegExp(`^${NUM}$`)

export type SourceNumber = {
  raw: string
  value: number
  halfUnit: number
}

export type AdsecNode = {
  id: number
  /** AdSec y, mapped to project x. */
  x: SourceNumber
  /** AdSec z, mapped to project y. */
  y: SourceNumber
}

export type AdsecBar = AdsecNode & {
  diameter: SourceNumber
  material: string
}

export type AdsecLoad = {
  id: number
  axial: SourceNumber
  /** AdSec Myy, mapped to project Mx; normalized to kN·m. */
  mx: SourceNumber
  /** AdSec Mzz, mapped to project My; normalized to kN·m. */
  my: SourceNumber
  magnitude: SourceNumber
  angleDeg: SourceNumber
}

export type AdsecSummary =
  | { id: number; status: 'no-solution' }
  | {
      id: number
      status: 'solved'
      /** ULS N for EC2 routes, nominal Pn=P/phi for ACI routes is derived by the audit runner. */
      appliedAxial: SourceNumber
      capacityMoment: SourceNumber
      strengthFactor: SourceNumber | null
      governing: string
      neutralAxisAngleDeg: SourceNumber
      neutralAxisDepth: SourceNumber
    }

export type AdsecPlane = {
  id: number
  e0: SourceNumber
  /** AdSec kyy, mapped to project kx and normalized to 1/mm. */
  kx: SourceNumber
  /** AdSec kzz, mapped to project ky and normalized to 1/mm. */
  ky: SourceNumber
}

export type AdsecPointResult = {
  caseId: number
  index: number
  x: SourceNumber
  y: SourceNumber
  strain: SourceNumber
  /** Normalized to MPa. */
  stress: SourceNumber
}

export type AdsecConcreteMaterial = {
  name: string
  fckMpa: SourceNumber
  elasticModulusMpa: SourceNumber
  gammaC: SourceNumber | null
  epsCu: SourceNumber
  epsC2: SourceNumber | null
  compressionCurve: 'explicit' | 'parabolic-rectangular' | 'rectangular'
  explicitPoints: readonly { strain: SourceNumber; stressMpa: SourceNumber }[]
}

export type AdsecSteelMaterial = {
  name: string
  fyMpa: SourceNumber
  elasticModulusMpa: SourceNumber
  gammaS: SourceNumber | null
  epsU: SourceNumber
  curveLabel: string
}

export type ParsedAdsecReport = {
  manifest: AdsecManifestEntry
  sourceHash: string
  standardText: string
  sectionName: string
  sectionArea: SourceNumber
  reinforcementArea: SourceNumber
  referencePoint: { x: SourceNumber; y: SourceNumber }
  nodes: readonly AdsecNode[]
  bars: readonly AdsecBar[]
  concrete: AdsecConcreteMaterial
  steel: AdsecSteelMaterial
  loads: readonly AdsecLoad[]
  summaries: readonly AdsecSummary[]
  planes: readonly AdsecPlane[]
  concretePoints: readonly AdsecPointResult[]
  rebarPoints: readonly AdsecPointResult[]
  sourceMomentUnit: 'kNm' | 'kNmm'
  sourceCurvatureUnit: '1/m' | '1/mm'
  sourceStressUnit: 'MPa' | 'kPa'
}

export const sourceNumber = (raw: string): SourceNumber => {
  const token = raw.trim()
  if (!NUMBER_TOKEN.test(token)) throw new Error(`Invalid source number: ${raw}`)
  const value = Number(token)
  if (!Number.isFinite(value)) throw new Error(`Non-finite source number: ${raw}`)
  const [mantissa, exponentText] = token.toLowerCase().split('e')
  const exponent = exponentText === undefined ? 0 : Number(exponentText)
  const dot = mantissa.indexOf('.')
  const decimalPlaces = dot < 0 ? 0 : mantissa.length - dot - 1
  return { raw: token, value, halfUnit: 0.5 * 10 ** (exponent - decimalPlaces) }
}

export const scaleSourceNumber = (number: SourceNumber, scale: number): SourceNumber => ({
  raw: number.raw,
  value: number.value * scale,
  halfUnit: number.halfUnit * Math.abs(scale)
})

const normalizedLines = (raw: string) => raw
  .split(/\r?\n/u)
  .map((line) => line
    .replace(/&#x20;/gu, ' ')
    .replace(/\\\[/gu, '[')
    .replace(/\\\]/gu, ']')
    .replace(/\\_/gu, '_')
    .replace(/\s+$/u, ''))
  .filter((line) => line.trim().length > 0)

const headerIndex = (lines: readonly string[], header: string, from = 0) => {
  for (let index = from; index < lines.length; index += 1) {
    if (lines[index]?.trim() === header) return index
  }
  throw new Error(`Report section not found: ${header}`)
}

const rowsBetween = (lines: readonly string[], startHeader: string, stopHeader: string) => {
  const start = headerIndex(lines, startHeader)
  const stop = headerIndex(lines, stopHeader, start + 1)
  return lines.slice(start + 1, stop)
}

const firstMatch = (lines: readonly string[], pattern: RegExp, label: string) => {
  for (const line of lines) {
    const match = pattern.exec(line)
    if (match?.[1]) return match[1]
  }
  throw new Error(`Report field not found: ${label}`)
}

const optionalMatch = (lines: readonly string[], pattern: RegExp) => {
  for (const line of lines) {
    const match = pattern.exec(line)
    if (match?.[1]) return match[1]
  }
  return null
}

const unitNumber = (raw: string, unit: 'MPa' | 'kPa') =>
  scaleSourceNumber(sourceNumber(raw), unit === 'kPa' ? 1e-3 : 1)

const parseNodes = (lines: readonly string[]) => {
  const nodes: AdsecNode[] = []
  const pattern = new RegExp(`^\\s*(\\d+)\\s+(${NUM})\\s+(${NUM})\\s*$`)
  for (const line of rowsBetween(lines, 'Section Nodes', 'Bars')) {
    const match = pattern.exec(line)
    if (!match?.[1] || !match[2] || !match[3]) continue
    nodes.push({ id: Number(match[1]), x: sourceNumber(match[2]), y: sourceNumber(match[3]) })
  }
  return nodes
}

const parseBars = (lines: readonly string[]) => {
  const bars: AdsecBar[] = []
  const pattern = new RegExp(`^\\s*(\\d+)\\s+(${NUM})\\s+(${NUM})\\s+(${NUM})\\s+(\\S+)\\s+\\S+`)
  for (const line of rowsBetween(lines, 'Bars', 'Elastic Properties')) {
    const match = pattern.exec(line)
    if (!match?.[1] || !match[2] || !match[3] || !match[4] || !match[5]) continue
    bars.push({
      id: Number(match[1]),
      x: sourceNumber(match[2]),
      y: sourceNumber(match[3]),
      diameter: sourceNumber(match[4]),
      material: match[5]
    })
  }
  return bars
}

const parseMaterial = (lines: readonly string[]) => {
  const concreteRows = rowsBetween(lines, 'Section Material Properties', 'Reinforcement Properties')
  const reinforcementStart = headerIndex(lines, 'Reinforcement Properties')
  const loadingStart = headerIndex(lines, 'Loading', reinforcementStart + 1)
  const steelRows = lines.slice(reinforcementStart + 1, loadingStart)

  const concreteName = firstMatch(concreteRows, /^\s*Name\s+(\S+)/u, 'concrete name')
  const strength = (() => {
    const match = firstMatch(
      concreteRows,
      new RegExp(`^\\s*Cylinder Strength\\s+\\S+\\s+(${NUM}(?:MPa|kPa))`),
      'concrete strength'
    )
    const unit = match.endsWith('kPa') ? 'kPa' : 'MPa'
    return unitNumber(match.slice(0, -unit.length), unit)
  })()
  const concreteModulus = (() => {
    const match = firstMatch(concreteRows, new RegExp(`\\bE\\s+(${NUM}(?:MPa|kPa))`), 'concrete modulus')
    const unit = match.endsWith('kPa') ? 'kPa' : 'MPa'
    return unitNumber(match.slice(0, -unit.length), unit)
  })()
  const gammaCRaw = optionalMatch(concreteRows, new RegExp(`gmc,ULS\\s+(${NUM})`))
  const epsCu = sourceNumber(firstMatch(concreteRows, new RegExp(`^\\s*Maximum Strain\\s+(${NUM})`), 'concrete epsCu'))
  const epsC2Raw = optionalMatch(concreteRows, new RegExp(`^\\s*Plateau Strain\\s+(${NUM})`))
  const curveText = firstMatch(concreteRows, /^\s*ULS Compression Curve\s+(.+?)\s*$/u, 'ULS compression curve')
  const compressionCurve = curveText.includes('Explicit')
    ? 'explicit'
    : curveText.includes('Parabola-rect')
      ? 'parabolic-rectangular'
      : curveText.includes('Rectangular')
        ? 'rectangular'
        : null
  if (compressionCurve === null) throw new Error(`Unsupported AdSec concrete curve: ${curveText}`)

  const explicitPoints: Array<{ strain: SourceNumber; stressMpa: SourceNumber }> = []
  if (compressionCurve === 'explicit') {
    let inCurve = false
    for (const line of concreteRows) {
      const trimmed = line.trim()
      if (trimmed.startsWith('ULS Compression Curve')) {
        inCurve = true
        continue
      }
      if (!inCurve || (trimmed.startsWith('Strain') && trimmed.includes('Stress'))) continue
      const match = new RegExp(`^(${NUM})\\[-\\]\\s+(${NUM})\\s*$`).exec(trimmed)
      if (!match?.[1] || !match[2]) {
        if (explicitPoints.length > 0) break
        continue
      }
      explicitPoints.push({
        strain: sourceNumber(match[1]),
        /** The explicit report table is printed in Pa even though its heading omits the unit. */
        stressMpa: scaleSourceNumber(sourceNumber(match[2]), 1e-6)
      })
    }
  }

  const steelName = firstMatch(steelRows, /^\s*Name\s+(\S+)/u, 'steel name')
  const fy = (() => {
    const match = firstMatch(steelRows, new RegExp(`^\\s*fy\\s+(${NUM}(?:MPa|kPa))`), 'steel fy')
    const unit = match.endsWith('kPa') ? 'kPa' : 'MPa'
    return unitNumber(match.slice(0, -unit.length), unit)
  })()
  const steelModulus = (() => {
    const match = firstMatch(steelRows, new RegExp(`^\\s*Modulus\\s+(${NUM}(?:MPa|kPa))`), 'steel modulus')
    const unit = match.endsWith('kPa') ? 'kPa' : 'MPa'
    return unitNumber(match.slice(0, -unit.length), unit)
  })()
  const gammaSRaw = optionalMatch(steelRows, new RegExp(`gms,ULS\\s+(${NUM})`))
  const steelEpsU = sourceNumber(firstMatch(steelRows, new RegExp(`^\\s*Maximum Strain\\s+(${NUM})`), 'steel epsU'))
  const steelCurve = firstMatch(steelRows, /^\s*Stress\/Strain Curve\s+(.+?)\s*$/u, 'steel curve')

  return {
    concrete: {
      name: concreteName,
      fckMpa: strength,
      elasticModulusMpa: concreteModulus,
      gammaC: gammaCRaw === null ? null : sourceNumber(gammaCRaw),
      epsCu,
      epsC2: epsC2Raw === null ? null : sourceNumber(epsC2Raw),
      compressionCurve,
      explicitPoints
    } satisfies AdsecConcreteMaterial,
    steel: {
      name: steelName,
      fyMpa: fy,
      elasticModulusMpa: steelModulus,
      gammaS: gammaSRaw === null ? null : sourceNumber(gammaSRaw),
      epsU: steelEpsU,
      curveLabel: steelCurve
    } satisfies AdsecSteelMaterial
  }
}

const parseLoads = (lines: readonly string[]) => {
  const rows = rowsBetween(lines, 'Strength Analysis - Loads', 'Strength Analysis - Summary')
  const momentUnit: 'kNm' | 'kNmm' = rows.some((line) => line.includes('[kNmm]')) ? 'kNmm' : 'kNm'
  const momentScale = momentUnit === 'kNmm' ? 1e-3 : 1
  const loads: AdsecLoad[] = []
  const pattern = new RegExp(`^\\s*(\\d+)\\s+(${NUM})\\s+(${NUM})\\s+(${NUM})\\s+(${NUM})\\s+(${NUM})\\s*$`)
  for (const line of rows) {
    const match = pattern.exec(line)
    if (!match?.[1] || !match[2] || !match[3] || !match[4] || !match[5] || !match[6]) continue
    loads.push({
      id: Number(match[1]),
      axial: sourceNumber(match[2]),
      mx: scaleSourceNumber(sourceNumber(match[3]), momentScale),
      my: scaleSourceNumber(sourceNumber(match[4]), momentScale),
      magnitude: scaleSourceNumber(sourceNumber(match[5]), momentScale),
      angleDeg: sourceNumber(match[6])
    })
  }
  return { loads, momentUnit }
}

const parseSummaries = (
  lines: readonly string[],
  momentUnit: 'kNm' | 'kNmm',
  nominal: boolean
) => {
  const rows = rowsBetween(lines, 'Strength Analysis - Summary', 'Strength Analysis - Details')
  const momentScale = momentUnit === 'kNmm' ? 1e-3 : 1
  const summaries: AdsecSummary[] = []
  const noSolution = new Set<number>()
  for (const line of rows) {
    const match = /^\s*(\d+)\s+No Solution/u.exec(line)
    if (match?.[1]) noSolution.add(Number(match[1]))
    if (line.trim() === 'Maxima') break
  }

  const ulsPattern = new RegExp(
    `^\\s*(\\d+)\\s+${NUM}\\s+${NUM}\\s+(${NUM})\\s+${NUM}\\s+(${NUM})\\s+${NUM}\\s+([A-C]:\\s*\\S+\\s*\\d+)\\s+(${NUM})\\s+(${NUM})\\s*$`
  )
  const nominalPattern = new RegExp(
    `^\\s*(\\d+)\\s+${NUM}\\s+${NUM}\\s+(${NUM})\\s+${NUM}\\s+(${NUM})\\s+(${NUM})\\s+${NUM}\\s+${NUM}\\s+([A-C]:\\s*\\S+\\s*\\d+)\\s+(${NUM})\\s+(${NUM})\\s*$`
  )
  for (const line of rows) {
    if (line.trim() === 'Maxima') break
    const match = (nominal ? nominalPattern : ulsPattern).exec(line)
    if (!match?.[1] || !match[2] || !match[3]) continue
    if (nominal) {
      if (!match[4] || !match[5] || !match[6] || !match[7]) continue
      summaries.push({
        id: Number(match[1]),
        status: 'solved',
        appliedAxial: sourceNumber(match[2]),
        strengthFactor: sourceNumber(match[3]),
        capacityMoment: scaleSourceNumber(sourceNumber(match[4]), momentScale),
        governing: match[5].replace(/\s+/gu, ' '),
        neutralAxisAngleDeg: sourceNumber(match[6]),
        neutralAxisDepth: sourceNumber(match[7])
      })
    } else {
      if (!match[4] || !match[5] || !match[6]) continue
      summaries.push({
        id: Number(match[1]),
        status: 'solved',
        appliedAxial: sourceNumber(match[2]),
        strengthFactor: null,
        capacityMoment: scaleSourceNumber(sourceNumber(match[3]), momentScale),
        governing: match[4].replace(/\s+/gu, ' '),
        neutralAxisAngleDeg: sourceNumber(match[5]),
        neutralAxisDepth: sourceNumber(match[6])
      })
    }
  }
  for (const id of [...noSolution].sort((left, right) => left - right)) {
    summaries.push({ id, status: 'no-solution' })
  }
  return summaries.sort((left, right) => left.id - right.id)
}

const parsePlanes = (lines: readonly string[], nominal: boolean) => {
  const header = nominal ? 'Strain Planes at Nominal Strength' : 'Strain Planes at ULS Strength'
  const rows = rowsBetween(lines, header, nominal
    ? 'Section Material Stresses/Strains at Nominal Strength'
    : 'Section Material Stresses/Strains at ULS Strength')
  const curvatureUnit: '1/m' | '1/mm' = rows.some((line) => line.includes('[/mm]')) ? '1/mm' : '1/m'
  const curvatureScale = curvatureUnit === '1/m' ? 1e-3 : 1
  const planes: AdsecPlane[] = []
  let currentCase = 0
  const pattern = new RegExp(
    `^\\s*(\\d+)?\\s+(Reinforcement|User Creep/Shrinkage|Total \\(Concrete\\))\\s+(${NUM})\\s+(${NUM})\\s+(${NUM})\\s*$`
  )
  for (const line of rows) {
    const match = pattern.exec(line)
    if (!match?.[2] || !match[3] || !match[4] || !match[5]) continue
    if (match[1]) currentCase = Number(match[1])
    if (match[2] !== 'Total (Concrete)') continue
    planes.push({
      id: currentCase,
      e0: sourceNumber(match[3]),
      kx: scaleSourceNumber(sourceNumber(match[4]), curvatureScale),
      ky: scaleSourceNumber(sourceNumber(match[5]), curvatureScale)
    })
  }
  return { planes, curvatureUnit }
}

const parsePointResults = (
  lines: readonly string[],
  header: string,
  stopHeader: string | null
) => {
  const start = headerIndex(lines, header)
  const stop = stopHeader === null ? lines.length : headerIndex(lines, stopHeader, start + 1)
  const headerRows = lines.slice(start + 1, Math.min(stop, start + 20))
  const stressUnit: 'MPa' | 'kPa' = headerRows.some((line) => line.includes('[kPa]')) ? 'kPa' : 'MPa'
  const stressScale = stressUnit === 'kPa' ? 1e-3 : 1
  const points: AdsecPointResult[] = []
  const pattern = new RegExp(`^\\s*(\\d+)\\s+(\\d+)\\s+(${NUM})\\s+(${NUM})\\s+(${NUM})\\s+(${NUM})`)
  for (let index = start + 1; index < stop; index += 1) {
    const line = lines[index]
    if (line === undefined) continue
    const trimmed = line.trim()
    if (trimmed === 'Maxima' || trimmed === 'Minima') break
    const match = pattern.exec(line)
    if (!match?.[1] || !match[2] || !match[3] || !match[4] || !match[5] || !match[6]) continue
    points.push({
      caseId: Number(match[1]),
      index: Number(match[2]),
      x: sourceNumber(match[3]),
      y: sourceNumber(match[4]),
      strain: sourceNumber(match[5]),
      stress: scaleSourceNumber(sourceNumber(match[6]), stressScale)
    })
  }
  return { points, stressUnit }
}

export const parseAdsecReport = (manifest: AdsecManifestEntry, absolutePath: string): ParsedAdsecReport => {
  const raw = readFileSync(absolutePath, 'utf8')
  const sourceHash = createHash('sha256').update(raw).digest('hex')
  if (sourceHash !== manifest.sha256) {
    throw new Error(`${manifest.id}: source hash ${sourceHash} does not match manifest ${manifest.sha256}`)
  }
  const lines = normalizedLines(raw)
  const nominal = manifest.route === 'aci' || manifest.route === 'aci-2'
  const nodes = parseNodes(lines)
  const bars = parseBars(lines)
  const { concrete, steel } = parseMaterial(lines)
  const { loads, momentUnit } = parseLoads(lines)
  const summaries = parseSummaries(lines, momentUnit, nominal)
  const { planes, curvatureUnit } = parsePlanes(lines, nominal)
  const strengthLabel = nominal ? 'Nominal' : 'ULS'
  const concreteResults = parsePointResults(
    lines,
    `Section Material Stresses/Strains at ${strengthLabel} Strength`,
    `Reinforcement Stresses/Strains at ${strengthLabel} Strength`
  )
  const rebarResults = parsePointResults(
    lines,
    `Reinforcement Stresses/Strains at ${strengthLabel} Strength`,
    null
  )

  if (nodes.length !== manifest.expectedNodes) {
    throw new Error(`${manifest.id}: expected ${manifest.expectedNodes} nodes, parsed ${nodes.length}`)
  }
  if (bars.length !== manifest.expectedBars) {
    throw new Error(`${manifest.id}: expected ${manifest.expectedBars} bars, parsed ${bars.length}`)
  }
  if (loads.length !== manifest.expectedCases || summaries.length !== manifest.expectedCases) {
    throw new Error(
      `${manifest.id}: expected ${manifest.expectedCases} cases, parsed ${loads.length} loads and ${summaries.length} summaries`
    )
  }
  const solvedCases = summaries.filter((summary) => summary.status === 'solved')
  if (solvedCases.length !== manifest.expectedSolvedCases || planes.length !== manifest.expectedSolvedCases) {
    throw new Error(
      `${manifest.id}: expected ${manifest.expectedSolvedCases} solved cases, parsed ${solvedCases.length} summaries and ${planes.length} planes`
    )
  }
  if (concreteResults.points.length !== manifest.expectedSolvedCases * manifest.expectedNodes) {
    throw new Error(
      `${manifest.id}: expected ${manifest.expectedSolvedCases * manifest.expectedNodes} concrete point rows, parsed ${concreteResults.points.length}`
    )
  }
  if (rebarResults.points.length !== manifest.expectedSolvedCases * manifest.expectedBars) {
    throw new Error(
      `${manifest.id}: expected ${manifest.expectedSolvedCases * manifest.expectedBars} rebar point rows, parsed ${rebarResults.points.length}`
    )
  }

  const sectionDefinitionRows = rowsBetween(lines, 'Definition', 'Section Nodes')
  const sectionName = firstMatch(sectionDefinitionRows, /^\s*Name\s+(\S+)/u, 'section name')
  const sectionArea = sourceNumber(firstMatch(sectionDefinitionRows, new RegExp(`^\\s*Section Area\\s+(${NUM})mm2`), 'section area'))
  const reinforcementArea = sourceNumber(
    firstMatch(sectionDefinitionRows, new RegExp(`^\\s*Reinforcement Area\\s+(${NUM})mm2`), 'reinforcement area')
  )
  const referenceStart = headerIndex(lines, 'Reference Point')
  const referenceStopCandidates = ['Load Case Titles', 'Applied loads']
    .map((header) => {
      try {
        return headerIndex(lines, header, referenceStart + 1)
      } catch {
        return Number.POSITIVE_INFINITY
      }
    })
  const referenceStop = Math.min(...referenceStopCandidates)
  if (!Number.isFinite(referenceStop)) throw new Error(`${manifest.id}: reference-point table has no stop header`)
  const referenceRows = lines.slice(referenceStart + 1, referenceStop)
  const referenceX = sourceNumber(firstMatch(referenceRows, new RegExp(`Reference Point Coordinates\\s+y\\s+(${NUM})mm`), 'reference y'))
  const referenceY = sourceNumber(firstMatch(referenceRows, new RegExp(`^\\s*z\\s+(${NUM})mm`), 'reference z'))
  const specificationRows = rowsBetween(lines, 'General Specification', `Section ${manifest.family === 'pylon1-cj16' ? '3' : '1'} Details`)
  const codeLine = specificationRows.find((line) => line.trim().startsWith('Code of Practice'))?.trim() ?? 'unknown'

  return {
    manifest,
    sourceHash,
    standardText: codeLine.replace(/^Code of Practice\s+/u, '').trim(),
    sectionName,
    sectionArea,
    reinforcementArea,
    referencePoint: { x: referenceX, y: referenceY },
    nodes,
    bars,
    concrete,
    steel,
    loads,
    summaries,
    planes,
    concretePoints: concreteResults.points,
    rebarPoints: rebarResults.points,
    sourceMomentUnit: momentUnit,
    sourceCurvatureUnit: curvatureUnit,
    sourceStressUnit: concreteResults.stressUnit
  }
}
