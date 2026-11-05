import type { LoadCombination } from '@pm/project'

type LoadcaseAnalysisInputs = Readonly<{
  surface: unknown
  section: unknown
  rebars: unknown
  materialStore: unknown
  designBasis: unknown
}>

/** Immutable applied-input identity, independent of menu and presentation preferences. */
export const sameLoadcaseAnalysisInputs = (left: LoadcaseAnalysisInputs, right: LoadcaseAnalysisInputs) =>
  left.surface === right.surface && left.section === right.section && left.rebars === right.rebars &&
  left.materialStore === right.materialStore && left.designBasis === right.designBasis

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

export type LoadcaseFrameTransition<TFrame> = {
  frame: TFrame | null
  status: 'current' | 'previous' | 'pending'
}

/**
 * Keep one complete outgoing visual frame while another loadcase frame is assembled.
 *
 * The previous frame is returned only while its row exists on the same resistance surface, including
 * while that row's edited demand is recalculated. Callers must label `previous`; it is never re-associated
 * with the newly selected loadcase or mixed with that loadcase's partial solver evidence.
 */
export const loadcaseFrameForTransition = <
  TResult extends { demand: LoadCombination },
  TSurface,
  TFrame extends { result: TResult; selectedLoadcaseId: number; surface: TSurface }
>(
  loadcases: readonly LoadCombination[],
  requestedLoadcase: LoadCombination | null,
  requestedResult: TResult | null | undefined,
  requestedSurface: TSurface | null | undefined,
  completedFrame: TFrame | null | undefined
): LoadcaseFrameTransition<TFrame> => {
  const current = currentLoadcaseFrame(requestedLoadcase, requestedResult, requestedSurface, completedFrame)
  if (current) return { frame: current, status: 'current' }
  if (!requestedLoadcase || !requestedSurface || !completedFrame || completedFrame.surface !== requestedSurface) {
    return { frame: null, status: 'pending' }
  }

  const previousLoadcase = loadcases.find((loadcase) => loadcase.id === completedFrame.selectedLoadcaseId) ?? null
  if (!previousLoadcase) {
    return { frame: null, status: 'pending' }
  }
  return { frame: completedFrame, status: 'previous' }
}
