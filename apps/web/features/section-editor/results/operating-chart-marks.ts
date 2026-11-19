import { describeSteelMaterialLaw, type CompiledMaterial, type MaterialLawAudit, type SteelMaterial } from '@pm/materials'

/** Characteristic strain of the law (yield, peak, ultimate); `extend` widens the plot to include it. */
export type OperatingMark = { strain: number; label: string; extend: boolean }

/** Strain-axis symbols of the material law audit that mark a change of branch. */
export const CONCRETE_MARKS = ['εc0', 'εc2', 'εcu', 'εcu2']
export const STEEL_MARKS = ['εy']
/** Audit symbol of a declared post-yield construction strain (`linear-hardening` steel). */
export const STEEL_CONSTRUCTION_MARK = 'εuk'

/**
 * Characteristic strains from the package's law audit and compiled limits (no formula is repeated here).
 *
 * A plateau's ultimate strains are listed but widen nothing: past yield the curve carries no further
 * shape. A declared inclined branch (`construction`, the audit symbol of its construction strain) is
 * part of the defined law, so its end widens the plot on each side with an operating point. Otherwise
 * only a few εy of a branch with Eh ≪ Es are drawn, and it reads as a plateau. Tension ends at the
 * compiled tensile limit; compression ends at a declared compression bound or, without one, at the
 * construction point (εuk, fu,eff) of the symmetric law.
 */
export const lawMarks = (audit: MaterialLawAudit, symbols: readonly string[], signs: readonly (1 | -1)[],
  ultimate: { tension?: number; compression?: number }, construction?: string): OperatingMark[] => {
  const marks: OperatingMark[] = []
  for (const parameter of audit.parameters) {
    if (!symbols.includes(parameter.symbol) || !(parameter.value > 0)) continue
    for (const sign of signs) marks.push({ strain: sign * parameter.value, label: `${sign < 0 ? '−' : ''}${parameter.symbol}`, extend: true })
  }
  const constructionStrain = construction === undefined ? undefined
    : audit.parameters.find((parameter) => parameter.symbol === construction && parameter.value > 0)?.value
  const hardening = constructionStrain !== undefined
  const compression = ultimate.compression ?? constructionStrain
  if (compression !== undefined && signs.includes(1)) {
    marks.push({ strain: compression, label: ultimate.compression === undefined ? construction ?? 'εu' : 'εu', extend: hardening })
  }
  if (ultimate.tension !== undefined && signs.includes(-1)) marks.push({ strain: -ultimate.tension, label: '−εu', extend: hardening })
  return marks.filter((mark, index) => marks.findIndex((other) => Math.abs(other.strain - mark.strain) < 1e-12) === index)
}

/** Steel marks of one stage material: ±εy, and the ultimate strains of its compiled limits. */
export const steelLawMarks = (material: SteelMaterial, limits: CompiledMaterial['limits'] | undefined) =>
  lawMarks(describeSteelMaterialLaw(material), STEEL_MARKS, [1, -1],
    { tension: limits?.epsTensionUltimate, compression: limits?.epsCompressionUltimate }, STEEL_CONSTRUCTION_MARK)

/** Plotted strain range: the operating points, widened to the extending marks on each side that carries one. */
export const operatingStrainRange = (strains: readonly number[], marks: readonly OperatingMark[]) => {
  const hasNegative = Math.min(0, ...strains) < 0, hasPositive = Math.max(0, ...strains) > 0
  const extended = marks.filter((mark) => mark.extend && (mark.strain < 0 ? hasNegative : hasPositive))
    .map((mark) => mark.strain)
  const reach = Math.max(1e-4, ...[...strains, ...extended].map(Math.abs)) * 1.15
  return { lo: hasNegative ? -reach : 0, hi: hasPositive ? reach : 0 }
}
