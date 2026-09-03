import type { LoadCombination } from '@pm/project'

export const sameLoadcaseDemand = (left: LoadCombination, right: LoadCombination) =>
  left.id === right.id &&
  left.P === right.P &&
  left.Mx === right.Mx &&
  left.My === right.My &&
  left.actionBasis === right.actionBasis

/** Keep a dialog open during recalculation without ever pairing it with an older demand revision. */
export const currentLoadcaseEvidence = <T extends { demand: LoadCombination }>(
  loadcase: LoadCombination | null,
  candidate: T | null | undefined
): T | null => loadcase && candidate && sameLoadcaseDemand(candidate.demand, loadcase)
  ? candidate
  : null

/** Filter a keyed result cache at the render boundary so no row can show an older demand revision. */
export const currentLoadcaseEvidenceMap = <T extends { demand: LoadCombination }>(
  loadcases: readonly LoadCombination[],
  candidates: Readonly<Record<number, T>>
): Record<number, T> => Object.fromEntries(
  loadcases.flatMap((loadcase) => {
    const current = currentLoadcaseEvidence(loadcase, candidates[loadcase.id])
    return current ? [[loadcase.id, current] as const] : []
  })
)

/**
 * Publish a completed visual frame only when it belongs to the current demand, inverse result, and
 * resistance surface. Object identity on the result and surface also rejects an older analysis
 * revision whose load components happen to be unchanged.
 */
export const currentLoadcaseFrame = <
  TResult extends { demand: LoadCombination },
  TSurface,
  TFrame extends { result: TResult; selectedLoadcaseId: number; surface: TSurface }
>(
  loadcase: LoadCombination | null,
  result: TResult | null | undefined,
  surface: TSurface | null | undefined,
  frame: TFrame | null | undefined
): TFrame | null => {
  const currentResult = currentLoadcaseEvidence(loadcase, result)
  if (
    !loadcase ||
    !currentResult ||
    !surface ||
    !frame ||
    frame.selectedLoadcaseId !== loadcase.id ||
    frame.result !== currentResult ||
    frame.surface !== surface
  ) return null
  return frame
}
