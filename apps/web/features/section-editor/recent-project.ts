import {
  parseProjectDocument,
  serializeProjectDocument,
  type CalculationProfileId
} from '@pm/project'

export const RECENT_PROJECT_STORAGE_KEY = 'pm-column-designer:recent-project:v1'

export type RecentProject = {
  raw: string
  name: string
  updatedAt: string
  calculationProfileId: CalculationProfileId
}

/** Accept only a valid current project document; older or corrupt local data is discarded. */
export const recentProjectFromRaw = (raw: unknown): RecentProject | null => {
  if (raw == null) return null
  const parsed = parseProjectDocument(raw)
  if (!parsed.ok) return null
  return {
    raw: serializeProjectDocument(parsed.document),
    name: parsed.document.meta.name || parsed.document.inputs.geometry.name || 'Column project',
    updatedAt: parsed.document.meta.updatedAt,
    calculationProfileId: parsed.document.inputs.calculationProfileId
  }
}
