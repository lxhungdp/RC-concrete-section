import type { InversePreviewResult } from '@pm/analysis'
import { DEFAULT_DEMAND_CHECK_BASIS, type DemandCheckBasis } from '@pm/project'

/** The basis a stored result was composed under. An uncomposed result has no declared basis. */
export const checkBasisOfResult = (result: InversePreviewResult): DemandCheckBasis =>
  result.designCheck.evaluated ? result.designCheck.definition : DEFAULT_DEMAND_CHECK_BASIS

/** Report wording only. Every number stays the kernel's value for the declared basis. */
export const checkBasisLabels = (basis: DemandCheckBasis = DEFAULT_DEMAND_CHECK_BASIS) => basis === 'constantAxial'
  ? {
      title: 'Constant P',
      basis: 'Horizontal ray at P = Pu against the Design surface',
      heading: 'Declared check holds P = Pu against the Design surface.',
      note: 'UR is moment utilization at constant axial force: Md/Mb on the ray at P = Pu. It is not total utilization. The proportional 3D ratio is a secondary diagnostic only.',
      pdfNote: 'UR is moment utilization at constant axial force: the demand moment divided by the Design-surface moment at P = Pu. It is not total utilization. A proportional 3D ratio is reported per combination in its detail section and is a secondary diagnostic only.'
    }
  : {
      title: '3D load ray',
      basis: 'Governing proportional 3D ray against the Design surface',
      heading: 'Governing check is the proportional 3D ray against the Design surface.',
      note: 'UR is the governing proportional utilization: the factored demand vector scaled until it meets the Design surface. The fixed-P ratio holds the axial force constant instead and is a secondary diagnostic only.',
      pdfNote: 'UR is the governing proportional utilization: the factored demand vector scaled until it meets the Design surface. A fixed-axial ratio is reported per combination in its detail section and is a secondary diagnostic only.'
    }
