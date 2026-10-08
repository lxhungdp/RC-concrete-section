import {
  geometryInputFromOuterRings,
  validateGeometryInput,
  validatePolygonSection,
  type GeometryInput,
  type GeometryInputRebarView,
  type GeometryValidationIssue,
  type Point2
} from '@pm/geometry'

type BoundaryDraft = {
  id: number
  name: string
  outers: Point2[][][]
  rebars: GeometryInputRebarView[]
}

type BoundaryDraftApply =
  | { ok: true; input: GeometryInput }
  | { ok: false; issues: GeometryValidationIssue[] }

/** Validate raw rings before the input adapter can omit an incomplete outer. */
export const prepareBoundaryDraftForApply = (draft: BoundaryDraft): BoundaryDraftApply => {
  const solids = draft.outers.map((rings) => ({ outer: rings[0] ?? [], holes: rings.slice(1) }))
  const issues = validatePolygonSection({
    solids: solids.length ? solids : [{ outer: [], holes: [] }],
    rebars: draft.rebars
  })
  if (issues.length) return { ok: false, issues }

  const input = geometryInputFromOuterRings(draft.id, draft.name, draft.outers, draft.rebars)
  const inputIssues = validateGeometryInput(input)
  return inputIssues.length ? { ok: false, issues: inputIssues } : { ok: true, input }
}
