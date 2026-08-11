import stressStrainKds from '../../../../docs/examples/reference-case/projects/PM-advanced (7) 2D.pm-project.json'
import stressStrainEnUmdP16 from '../../../../docs/examples/reference-case/projects/P16_Column_ULS.pm-project.json'
import stressStrainKdsEnvico from '../../../../docs/examples/user-projects/ENVICO.pm-project.json'
import realisticKdsChamferedHollow from '../../../../docs/examples/realistic-sections/KDS-REAL-01-chamfered-hollow.pm-project.json'
import realisticKdsTwoCircularVoids from '../../../../docs/examples/realistic-sections/KDS-REAL-02-chamfered-two-circular-voids.pm-project.json'
import realisticKdsHSection from '../../../../docs/examples/realistic-sections/KDS-REAL-03-h-section.pm-project.json'
import realisticAciCircularAnnulus from '../../../../docs/examples/realistic-sections/ACI-REAL-04-circular-annulus.pm-project.json'

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
    id: 'kds-stress-strain-envico',
    label: 'ENVICO',
    description: 'KDS · Stress–strain',
    document: stressStrainKdsEnvico
  },
  {
    id: 'en-umd-p16',
    label: 'Stress–strain',
    description: 'EN 1992 · P16 UMD',
    document: stressStrainEnUmdP16
  },
  {
    id: 'kds-real-chamfered-hollow',
    label: 'Eq Stress',
    description: 'KDS · Chamfered hollow',
    document: realisticKdsChamferedHollow
  },
  {
    id: 'kds-real-two-circular-voids',
    label: 'Eq Stress',
    description: 'KDS · Two circular voids',
    document: realisticKdsTwoCircularVoids
  },
  {
    id: 'kds-real-h-section',
    label: 'Eq Stress',
    description: 'KDS · H-section',
    document: realisticKdsHSection
  },
  {
    id: 'aci-real-circular-annulus',
    label: 'Eq Stress',
    description: 'ACI 318 · Circular annulus',
    document: realisticAciCircularAnnulus
  }
]
