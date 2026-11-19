import type { PmProjectDocument } from '@pm/project'

type AppliedProject = Readonly<{
  inputs: PmProjectDocument['inputs']
  meta: Pick<PmProjectDocument['meta'], 'id' | 'name' | 'information' | 'createdAt'>
}>

/** Input references and metadata values; exporting an unchanged project must not stale the editor. */
export const projectSpreadsheetRevision = ({ inputs, meta }: AppliedProject): readonly unknown[] => [
  inputs.geometry, inputs.materials, inputs.loadings, inputs.analysis, inputs.design, inputs.calculationProfileId,
  meta.id, meta.name, meta.createdAt, meta.information.client, meta.information.company,
  meta.information.designedBy, meta.information.checkedBy, meta.information.address, meta.information.date
]
export const sameProjectSpreadsheetRevision = (actual: unknown, expected: unknown): boolean =>
  Array.isArray(actual) && Array.isArray(expected) && actual.length === expected.length && actual.every((value, index) => Object.is(value, expected[index]))
