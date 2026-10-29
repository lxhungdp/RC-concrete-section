import { equationRebarProperties, type RebarGenerateParams, type RebarPatternKind } from '@pm/geometry'

export type RebarGeneratorState = {
  pattern: RebarPatternKind
  params: RebarGenerateParams
  replaceExisting: boolean
}

export const createRebarGeneratorState = (): RebarGeneratorState => ({
  pattern: 'top-bottom',
  params: { cover: 40, ...equationRebarProperties(20), count: 4, spacing: 100, solidIndex: 'all' },
  replaceExisting: true
})
