import stressStrainKds from '../../../../docs/examples/reference-case/projects/PM-advanced (7) 2D.pm-project.json'
import equivalentBlockKdsRectangle from '../../../../docs/examples/equivalent-block/KDS-EB-01-rectangle-8-bars.pm-project.json'
import equivalentBlockKdsHollow from '../../../../docs/examples/equivalent-block/KDS-EB-02-hollow-8-bars.pm-project.json'
import equivalentBlockKdsLShape from '../../../../docs/examples/equivalent-block/KDS-EB-03-l-shape-8-bars.pm-project.json'
import equivalentBlockKdsTwoRegions from '../../../../docs/examples/equivalent-block/KDS-EB-04-two-islands-8-bars.pm-project.json'
import equivalentBlockAciRectangle from '../../../../docs/examples/equivalent-block/ACI-EB-01-rectangle-8-bars.pm-project.json'

export type ProjectExample = {
  id: string
  label: string
  description: string
  document: unknown
}

/**
 * Version-1 project documents used by both the engineering verification suite and the UI examples.
 * Keeping the menu pointed at the canonical fixtures prevents an example from silently diverging
 * from the solver and project parser.
 */
export const PROJECT_EXAMPLES: readonly ProjectExample[] = [
  {
    id: 'kds-stress-strain-reference',
    label: 'Stress–strain',
    description: 'KDS · Rectangle',
    document: stressStrainKds
  },
  {
    id: 'kds-eq-rectangle',
    label: 'Eq Stress',
    description: 'KDS · Rectangle',
    document: equivalentBlockKdsRectangle
  },
  {
    id: 'kds-eq-hollow',
    label: 'Eq Stress',
    description: 'KDS · Hollow',
    document: equivalentBlockKdsHollow
  },
  {
    id: 'kds-eq-l-shape',
    label: 'Eq Stress',
    description: 'KDS · L-shape',
    document: equivalentBlockKdsLShape
  },
  {
    id: 'kds-eq-two-regions',
    label: 'Eq Stress',
    description: 'KDS · Two regions',
    document: equivalentBlockKdsTwoRegions
  },
  {
    id: 'aci-eq-rectangle',
    label: 'Eq Stress',
    description: 'ACI 318 · Rectangle',
    document: equivalentBlockAciRectangle
  }
]
